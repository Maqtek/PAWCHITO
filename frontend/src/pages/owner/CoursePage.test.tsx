import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readServer } from '../../mocks/server-state'
import { setSeedClock } from '../../test/clock'
import { findStatus, region } from '../../test/queries'
import { renderRoute } from '../../test/render'
import { SELECTED_PET_KEY } from '../../test/storage-keys'

const renderCourse = () => renderRoute('/course')
const course = () => region('Мелоксикам, 1,5 мл')
/** Дни курса — по первой строке пункта: «вторник, 27 октября». */
const days = () =>
  within(course())
    .getAllByRole('listitem')
    .filter((item) => item.parentElement?.tagName === 'OL')
    .map((item) => item.firstElementChild?.textContent)

// Среда, 28 октября 2026, 09:00 по Москве. Курс Майло после приёма №22: Мелоксикам в 20:00 с 12 октября по 1 ноября;
// до 26.10 выполнен, 22.10 пропущен, доза 27.10 просрочена.
beforeEach(() => setSeedClock('owner'))

describe('CoursePage', () => {
  it('активный курс: прогресс, дни с первой неотмеченной дозы, прошедшие — под кнопкой', async () => {
    const { user } = renderCourse()
    expect(await screen.findByText('14 из 21 выполнено, 1 пропущено')).toBeInTheDocument()
    expect(within(course()).getByRole('progressbar', { name: 'Прогресс курса: 14 из 21 выполнено, 1 пропущено' })).toHaveAttribute(
      'aria-valuenow',
      '14',
    )
    expect(within(course()).getByText('20:00 · 21 день · с 12 октября по 1 ноября')).toBeInTheDocument()
    expect(within(course()).getByRole('link', { name: 'Итог приёма' })).toHaveAttribute('href', '/appointments/22')
    expect(days()).toEqual([
      'вторник, 27 октября',
      'среда, 28 октября · сегодня',
      'четверг, 29 октября',
      'пятница, 30 октября',
      'суббота, 31 октября',
      'воскресенье, 1 ноября',
    ])
    expect(within(course()).getByText('Просрочено')).toBeInTheDocument()
    // Отметить можно сегодняшнюю и просроченную дозу; будущие — «Запланировано».
    expect(within(course()).getAllByRole('button', { name: /^Выполнено/ })).toHaveLength(2)
    expect(within(course()).getAllByText('Запланировано')).toHaveLength(4)

    await user.click(within(course()).getByRole('button', { name: 'Показать прошедшие дни (15)' }))
    expect(days()).toHaveLength(21)
    expect(within(course()).getAllByText('Пропущено')).toHaveLength(1)
  })

  it('отметка дозы: статус, прогресс пересчитан, фокус на днях курса', async () => {
    const { user } = renderCourse()
    await user.click(await screen.findByRole('button', { name: 'Выполнено, Мелоксикам, 1,5 мл, вторник, 27 октября, 20:00' }))
    await findStatus('Выполнено: Мелоксикам, 1,5 мл.')
    expect(await screen.findByText('15 из 21 выполнено, 1 пропущено')).toBeInTheDocument()
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1')
    // Все дозы до сегодня отмечены — дни показываются с сегодняшнего.
    expect(within(course()).getByRole('button', { name: 'Показать прошедшие дни (16)' })).toBeInTheDocument()
  })

  it('пропуск дозы — с подтверждением', async () => {
    const { user } = renderCourse()
    await user.click(await screen.findByRole('button', { name: 'Пропустить, Мелоксикам, 1,5 мл, сегодня, 20:00' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Пропустить дело' })).getByRole('button', { name: 'Пропустить' }))
    await findStatus('Пропущено: Мелоксикам, 1,5 мл.')
    expect(await screen.findByText('14 из 21 выполнено, 2 пропущено')).toBeInTheDocument()
    expect(readServer().reminders.find((item) => item.id === 17)?.status).toBe('skipped')
  })

  it('после последнего дня курс — в завершённых, только прогресс', async () => {
    vi.setSystemTime(new Date('2026-11-10T06:00:00Z'))
    renderCourse()
    expect(await screen.findByText('Активных курсов нет')).toBeInTheDocument()
    const completed = region('Завершённые курсы')
    expect(within(completed).getByText('Мелоксикам, 1,5 мл')).toBeInTheDocument()
    expect(await within(completed).findByText('14 из 21 выполнено, 1 пропущено')).toBeInTheDocument()
    expect(within(completed).queryByRole('button')).not.toBeInTheDocument()
  })

  it('у питомца без назначений — пояснение, откуда берутся курсы', async () => {
    localStorage.setItem(SELECTED_PET_KEY, '11')
    renderCourse()
    expect(await screen.findByText('Курсов лечения нет')).toBeInTheDocument()
    expect(screen.getByText('Дозы по назначению врача и прогресс курса: Барсик.')).toBeInTheDocument()
  })
})
