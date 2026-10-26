import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../app/routes'
import { readServer } from '../../mocks/server-state'
import { loginMockAs, resetMockServer } from '../../mocks/session'
import { renderWithProviders } from '../../test/render'

/** role="status" есть и у спиннеров, поэтому статус страницы ищем по тексту и проверяем, что он в live-регионе. */
async function findStatus(text: string) {
  const message = await screen.findByText(text)
  expect(message.closest('[role="status"]')).not.toBeNull()
  return message
}

const titles = () => screen.queryAllByRole('article').map((item) => within(item).getByRole('heading').textContent)
const renderTasks = () => renderWithProviders(<AppRoutes />, { route: '/tasks' })

// Среда, 28 октября 2026, 09:00 по Москве. У Майло: курс Мелоксикама в 20:00 до 1 ноября (доза 27.10 просрочена),
// «Купить корм» сегодня в 18:00, «Почистить зубы» раз в неделю — завтра в 21:00.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-28T06:00:00Z'))
  resetMockServer()
  loginMockAs('owner')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TasksPage', () => {
  it('просроченные и неделя вперёд по времени; отметка — на сегодня и раньше; дела курса не удаляются', async () => {
    renderTasks()
    expect(await screen.findByRole('article', { name: 'Купить корм' })).toBeInTheDocument()
    expect(screen.getByText('Календарь')).toBeInTheDocument()
    expect(titles()).toEqual([
      'Мелоксикам, 1,5 мл',
      'Купить корм',
      'Мелоксикам, 1,5 мл',
      'Мелоксикам, 1,5 мл',
      'Почистить зубы',
      'Мелоксикам, 1,5 мл',
      'Мелоксикам, 1,5 мл',
      'Мелоксикам, 1,5 мл',
    ])
    const [overdue] = screen.getAllByRole('article')
    expect(within(overdue).getByText('Просрочено')).toBeInTheDocument()
    expect(within(overdue).getByText('По курсу лечения')).toBeInTheDocument()
    expect(within(overdue).getByRole('button', { name: 'Выполнено, Мелоксикам, 1,5 мл, вторник, 27 октября, 20:00' })).toBeInTheDocument()
    expect(within(overdue).queryByRole('button', { name: /^Удалить/ })).not.toBeInTheDocument()

    const feed = screen.getByRole('article', { name: 'Купить корм' })
    expect(within(feed).getByText('сегодня, 18:00')).toBeInTheDocument()
    expect(within(feed).getByRole('button', { name: 'Удалить, Купить корм, сегодня, 18:00' })).toBeInTheDocument()
    // Завтрашнее дело ещё не отметить (Р-61), но своё можно удалить.
    const brushing = screen.getByRole('article', { name: 'Почистить зубы' })
    expect(within(brushing).getByText('Раз в 7 дней')).toBeInTheDocument()
    expect(within(brushing).queryByRole('button', { name: /^Выполнено/ })).not.toBeInTheDocument()
    expect(within(brushing).getByRole('button', { name: /^Удалить/ })).toBeInTheDocument()
    expect(screen.getByText('Просроченные и дела по 4 ноября включительно.')).toBeInTheDocument()
  })

  it('«Выполнено» — одной кнопкой: дело уходит из списка, статус, фокус на списке', async () => {
    const { user } = renderTasks()
    await user.click(await screen.findByRole('button', { name: 'Выполнено, Мелоксикам, 1,5 мл, вторник, 27 октября, 20:00' }))
    await findStatus('Выполнено: Мелоксикам, 1,5 мл.')
    await vi.waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(7))
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1')
    expect(readServer().reminders.find((item) => item.id === 16)?.status).toBe('done')
  })

  it('пропуск — с подтверждением; у серии статус называет следующее дело', async () => {
    // Четверг, 29.10, 22:00 — зубы на 21:00 просрочены.
    vi.setSystemTime(new Date('2026-10-29T19:00:00Z'))
    const { user } = renderTasks()
    await user.click(await screen.findByRole('button', { name: 'Пропустить, Почистить зубы, сегодня, 21:00' }))
    const dialog = screen.getByRole('dialog', { name: 'Пропустить дело' })
    expect(within(dialog).getByText(/Следующее дело серии появится, как обычно/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Пропустить' }))
    await findStatus('Пропущено: Почистить зубы. Следующее — четверг, 5 ноября, 21:00.')
    // Следующее дело серии — в пределах недели, в списке на месте пропущенного.
    expect(await screen.findByText('четверг, 5 ноября, 21:00')).toBeInTheDocument()
  })

  it('своё дело: ошибки формы, затем добавлено со своим интервалом', async () => {
    const { user } = renderTasks()
    await user.click(await screen.findByRole('button', { name: 'Добавить дело' }))
    const dialog = screen.getByRole('dialog', { name: 'Новое дело' })
    await user.click(within(dialog).getByRole('button', { name: 'Добавить дело' }))
    expect(within(dialog).getByLabelText('Название')).toHaveFocus()

    await user.type(within(dialog).getByLabelText('Название'), 'Погулять в парке')
    fireEvent.change(within(dialog).getByLabelText('Время'), { target: { value: '08:00' } })
    await user.selectOptions(within(dialog).getByLabelText('Повтор'), 'Свой интервал')
    await user.type(within(dialog).getByLabelText('Раз в сколько дней'), '400')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить дело' }))
    expect(within(dialog).getByText('Это время уже прошло')).toBeInTheDocument()
    expect(within(dialog).getByText('Повтор — от 1 до 365 дней')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Время')).toHaveFocus()

    fireEvent.change(within(dialog).getByLabelText('Время'), { target: { value: '19:30' } })
    await user.clear(within(dialog).getByLabelText('Раз в сколько дней'))
    await user.type(within(dialog).getByLabelText('Раз в сколько дней'), '3')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить дело' }))
    await findStatus('Дело добавлено: Погулять в парке, сегодня, 19:30.')
    const walk = await screen.findByRole('article', { name: 'Погулять в парке' })
    expect(within(walk).getByText('Раз в 3 дня')).toBeInTheDocument()
    expect(within(walk).getByText('Уход')).toBeInTheDocument()
    expect(readServer().reminders.at(-1)).toMatchObject({ due_at: '2026-10-28T19:30:00+03:00', repeat_interval_days: 3, series_id: 100 })
  })

  it('удаление своего дела — с подтверждением', async () => {
    const { user } = renderTasks()
    await user.click(await screen.findByRole('button', { name: 'Удалить, Почистить зубы, завтра, 21:00' }))
    const dialog = screen.getByRole('dialog', { name: 'Удалить дело' })
    expect(within(dialog).getByText(/Повторы прекратятся/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))
    await findStatus('Дело удалено.')
    expect(screen.queryByRole('article', { name: 'Почистить зубы' })).not.toBeInTheDocument()
  })

  it('«Показать ещё неделю» расширяет период; у другого питомца — его дела', async () => {
    localStorage.setItem('pawchito:selected-pet-id', '11')
    const { user } = renderTasks()
    expect(await screen.findByRole('article', { name: 'Капли от блох' })).toBeInTheDocument()
    expect(screen.getByText('Дела курса лечения и свои дела: Барсик.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Показать ещё неделю' }))
    expect(await screen.findByText('Просроченные и дела по 11 ноября включительно.')).toBeInTheDocument()
    expect(titles()).toEqual(['Капли от блох'])
  })
})
