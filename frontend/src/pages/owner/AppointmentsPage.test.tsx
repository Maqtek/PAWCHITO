import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../mocks/node'
import { readServer, updateServer } from '../../mocks/server-state'
import { setSeedClock } from '../../test/clock'
import { articleTitles, findStatus, region } from '../../test/queries'
import { renderRoute } from '../../test/render'
import { SELECTED_PET_KEY } from '../../test/storage-keys'

// Среда, 28 октября 2026, 09:00 по Москве; seed записей пересчитан от этой даты.
beforeEach(() => setSeedClock('owner'))

describe('AppointmentsPage', () => {
  it('предстоящие — по времени, прошедшие и отменённые — отдельно; отмена клиникой с комментарием, итог', async () => {
    renderRoute('/appointments')
    expect(await screen.findByRole('region', { name: 'Предстоящие' })).toBeInTheDocument()
    expect(articleTitles(region('Предстоящие'))).toEqual(['пятница, 30 октября, 10:00', 'понедельник, 2 ноября, 15:30'])
    expect(articleTitles(region('Прошедшие и отменённые'))).toEqual(['пятница, 23 октября, 12:00', 'понедельник, 12 октября, 11:00'])

    const cancelled = screen.getByRole('article', { name: 'пятница, 23 октября, 12:00' })
    expect(within(cancelled).getByText('Клиника отменила запись: «Врач заболела, перезапишитесь, пожалуйста»')).toBeInTheDocument()
    expect(within(cancelled).queryByRole('button', { name: /^Отменить/ })).not.toBeInTheDocument()
    const completed = screen.getByRole('article', { name: 'понедельник, 12 октября, 11:00' })
    expect(within(completed).getByText('Итог: Растяжение связок задней лапы')).toBeInTheDocument()

    const vaccination = screen.getByRole('article', { name: 'пятница, 30 октября, 10:00' })
    expect(within(vaccination).getByText('Подтверждена')).toBeInTheDocument()
    expect(within(vaccination).getByText('ВетДоктор · Петров Павел Петрович')).toBeInTheDocument()
    expect(within(vaccination).getByText('Вакцинация: Плановая от бешенства')).toBeInTheDocument()
    expect(within(vaccination).getByRole('link', { name: 'Подробнее, запись на пятница, 30 октября, 10:00' })).toHaveAttribute(
      'href',
      '/appointments/20',
    )
  })

  it('отмена с подтверждением: запись уходит в прошедшие, статус, фокус на списке', async () => {
    const { user } = renderRoute('/appointments')
    await user.click(await screen.findByRole('button', { name: 'Отменить, запись на понедельник, 2 ноября, 15:30' }))
    const dialog = screen.getByRole('dialog', { name: 'Отменить запись' })
    expect(within(dialog).getByText(/будет отменена/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Отменить запись' }))
    await findStatus('Запись отменена. Клиника получит уведомление.')
    expect(articleTitles(region('Предстоящие'))).toEqual(['пятница, 30 октября, 10:00'])
    expect(within(screen.getByRole('article', { name: 'понедельник, 2 ноября, 15:30' })).getByText('Вы отменили запись')).toBeInTheDocument()
    expect(region('Предстоящие').parentElement?.parentElement).toHaveFocus()
    expect(readServer().appointments.find((item) => item.id === 21)?.cancelled_by).toBe('owner')
  })

  it('приём начался, пока окно было открыто, — 409 в окне, запись на месте', async () => {
    server.use(
      http.post('*/api/appointments/:id/cancel', () => HttpResponse.json({ detail: 'Приём уже начался' }, { status: 409 })),
    )
    const { user } = renderRoute('/appointments')
    await user.click(await screen.findByRole('button', { name: 'Отменить, запись на пятница, 30 октября, 10:00' }))
    const dialog = screen.getByRole('dialog', { name: 'Отменить запись' })
    await user.click(within(dialog).getByRole('button', { name: 'Отменить запись' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Запись уже нельзя отменить')
  })

  it('смена питомца в переключателе — записи другого питомца', async () => {
    const { user } = renderRoute('/appointments')
    await screen.findByRole('region', { name: 'Предстоящие' })
    await user.click(screen.getByRole('button', { name: /^Питомец: Майло/ }))
    await user.click(screen.getByRole('button', { name: /Барсик/ }))
    // У Барсика одна заявка на завтра.
    expect(await screen.findByRole('article', { name: 'четверг, 29 октября, 09:00' })).toBeInTheDocument()
  })

  it('у питомца без записей — приглашение записаться', async () => {
    updateServer((state) => {
      state.appointments = state.appointments.filter((item) => item.pet_id !== 11)
    })
    localStorage.setItem(SELECTED_PET_KEY, '11')
    renderRoute('/appointments')
    expect(await screen.findByRole('heading', { name: 'Записей пока нет' })).toBeInTheDocument()
    expect(
      screen.getByText('Запишите питомца Барсик к врачу — клиника подтвердит запись, а статус появится здесь.'),
    ).toBeInTheDocument()
    // Вторая такая же ссылка — в шапке страницы: обе ведут в мастер записи.
    for (const link of screen.getAllByRole('link', { name: 'Записаться к врачу' })) {
      expect(link).toHaveAttribute('href', '/appointments/new')
    }
  })
})

describe('AppointmentPage', () => {
  it('подробности записи и отмена прямо со страницы', async () => {
    const { user } = renderRoute('/appointments/21')
    expect(await screen.findByText('Повторный приём')).toBeInTheDocument()
    expect(screen.getByText('Клиника ещё не подтвердила запись.')).toBeInTheDocument()
    expect(screen.getByText('Ким Елена Викторовна')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Отменить запись' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отменить запись' }))
    await findStatus('Запись отменена. Клиника получит уведомление.')
    expect(screen.getByText('Вы отменили запись')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Отменить запись' })).not.toBeInTheDocument()
  })

  it('итог завершённой записи; чужая или несуществующая — «Запись не найдена»', async () => {
    const view = renderRoute('/appointments/22')
    expect(await screen.findByRole('heading', { name: 'Итог приёма' })).toBeInTheDocument()
    expect(screen.getByText('Статус ухода: На лечении')).toBeInTheDocument()
    view.unmount()
    renderRoute('/appointments/25')
    expect(await screen.findByText('Запись не найдена')).toBeInTheDocument()
  })

  it('итог с рецептами и прививками: время приёма, срок, начало курса', async () => {
    updateServer((state) => {
      const outcome = state.appointments.find((item) => item.id === 22)?.outcome
      if (!outcome) return
      outcome.prescriptions = [
        { id: 1, drug: 'Мелоксикам', dosage: '1,5 мл', times: ['09:00', '21:00'], duration_days: 5, start_date: '2026-10-12' },
      ]
      outcome.vaccinations = [
        { id: 9, pet_id: 10, name: 'Рабис', date: '2026-10-12', next_date: '2027-10-12', source: 'clinic', appointment_id: 22 },
      ]
    })
    renderRoute('/appointments/22')
    const outcome = await screen.findByRole('region', { name: 'Итог приёма' })
    expect(within(outcome).getByText('Мелоксикам, 1,5 мл')).toBeInTheDocument()
    expect(within(outcome).getByText('09:00, 21:00 · 5 дней с 12 октября 2026')).toBeInTheDocument()
    expect(within(outcome).getByRole('link', { name: '«Курс лечения»' })).toHaveAttribute('href', '/course')
    expect(within(outcome).getByText('— 12 октября 2026, следующая 12 октября 2027')).toBeInTheDocument()
  })
})
