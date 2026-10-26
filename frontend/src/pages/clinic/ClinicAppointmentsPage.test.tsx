import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { readServer, updateServer } from '../../mocks/server-state'
import { setSeedClock } from '../../test/clock'
import { articleTitles, findStatus } from '../../test/queries'
import { renderRoute } from '../../test/render'

const renderPage = (route = '/clinic/appointments') => renderRoute(route)

// Среда, 28 октября 2026, 09:00 по Москве; seed записей пересчитан от этой даты.
beforeEach(() => setSeedClock('clinic'))

describe('ClinicAppointmentsPage', () => {
  it('расписание на неделю с сегодняшнего дня; фильтр по врачу и статусу', async () => {
    const { user } = renderPage()
    expect(await screen.findByRole('article', { name: 'четверг, 29 октября, 09:00' })).toBeInTheDocument()
    expect(articleTitles()).toEqual(['четверг, 29 октября, 09:00', 'пятница, 30 октября, 10:00', 'пятница, 30 октября, 10:30', 'понедельник, 2 ноября, 15:30'])
    await user.selectOptions(screen.getByLabelText('Врач'), 'Ким Елена Викторовна')
    await waitFor(() => expect(articleTitles()).toEqual(['четверг, 29 октября, 09:00', 'понедельник, 2 ноября, 15:30']))
    await user.selectOptions(screen.getByLabelText('Статус'), 'Подтверждена')
    expect(await screen.findByText('Записей нет')).toBeInTheDocument()
  })

  it('ссылка из уведомления открывает день приёма', async () => {
    renderPage('/clinic/appointments?date_from=2026-10-30&date_to=2026-10-30')
    expect(await screen.findByRole('article', { name: 'пятница, 30 октября, 10:00' })).toBeInTheDocument()
    expect(articleTitles()).toEqual(['пятница, 30 октября, 10:00', 'пятница, 30 октября, 10:30'])
    expect(screen.getByLabelText('С')).toHaveValue('2026-10-30')
  })

  it('подтверждение заявки — без окна, статус; у подтверждённой кнопки нет', async () => {
    const { user } = renderPage()
    await user.click(await screen.findByRole('button', { name: 'Подтвердить, Барсик, четверг, 29 октября, 09:00' }))
    await findStatus('Запись подтверждена: Барсик, четверг, 29 октября, 09:00. Владелец получит уведомление.')
    const barsik = screen.getByRole('article', { name: 'четверг, 29 октября, 09:00' })
    await waitFor(() => expect(within(barsik).getByText('Подтверждена')).toBeInTheDocument())
    expect(within(barsik).queryByRole('button', { name: /^Подтвердить/ })).not.toBeInTheDocument()
    expect(readServer().appointments.find((item) => item.id === 24)?.status).toBe('confirmed')
  })

  it('отмена с обязательным комментарием владельцу', async () => {
    const { user } = renderPage()
    await user.click(await screen.findByRole('button', { name: 'Отменить, Майло, понедельник, 2 ноября, 15:30' }))
    const dialog = screen.getByRole('dialog', { name: 'Отменить запись' })
    await user.click(within(dialog).getByRole('button', { name: 'Отменить запись' }))
    expect(within(dialog).getByLabelText('Комментарий для владельца')).toHaveFocus()
    expect(within(dialog).getByText('Напишите владельцу, почему запись отменена')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Комментарий для владельца'), 'Врач на конференции')
    await user.click(within(dialog).getByRole('button', { name: 'Отменить запись' }))
    await findStatus('Запись отменена: Майло. Владелец получит уведомление с вашим комментарием.')
    const cancelled = screen.getByRole('article', { name: 'понедельник, 2 ноября, 15:30' })
    await waitFor(() => expect(within(cancelled).getByText('Вы отменили запись: «Врач на конференции»')).toBeInTheDocument())
  })

  it('вкладки «Ждут итога» и «Требуют решения» с числами', async () => {
    updateServer((state) => {
      const kim = state.vets.find((vet) => vet.id === 6)
      if (kim) kim.on_vacation = true
    })
    const { user } = renderPage()
    await user.click(await screen.findByRole('tab', { name: 'Требуют решения (2)' }))
    expect(await screen.findByRole('article', { name: 'четверг, 29 октября, 09:00' })).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'четверг, 29 октября, 09:00' })).getByText('Врач в отпуске')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Ждут итога (0)' }))
    expect(await screen.findByText('Итогов не ждёт ни одна запись')).toBeInTheDocument()
  })
})
