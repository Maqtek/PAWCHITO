import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../app/routes'
import { readServer, updateServer, type MockReminder } from '../../mocks/server-state'
import { loginMockAs, resetMockServer } from '../../mocks/session'
import { renderWithProviders } from '../../test/render'

/** role="status" есть и у спиннеров, поэтому статус страницы ищем по тексту и проверяем, что он в live-регионе. */
async function findStatus(text: string) {
  const message = await screen.findByText(text)
  expect(message.closest('[role="status"]')).not.toBeNull()
  return message
}

const group = (name: string) => screen.getByRole('region', { name })
/** Заголовки событий группы по порядку. */
const titles = (name: string) =>
  within(group(name))
    .queryAllByRole('article')
    .map((item) => within(item).getByRole('heading').textContent)
const renderTasks = () => renderWithProviders(<AppRoutes />, { route: '/tasks' })

/** Своё дело питомца в состоянии моков — для дальних дат, которые форма отнимает много шагов. */
function addReminder(id: number, petId: number, title: string, dueAt: string) {
  updateServer((state) => {
    const reminder: MockReminder = {
      id,
      pet_id: petId,
      source: 'custom',
      prescription_id: null,
      title,
      category: 'routine',
      due_at: dueAt,
      status: 'pending',
      done_at: null,
      repeat_interval_days: null,
      series_id: null,
    }
    state.reminders.push(reminder)
  })
}

// Среда, 28 октября 2026, 09:00 по Москве. У Майло: курс Мелоксикама в 20:00 до 1 ноября (доза 27.10 просрочена),
// «Купить корм» сегодня в 18:00, «Почистить зубы» раз в неделю — завтра в 21:00; запись №20 — через 2 дня (вакцинация,
// подтверждена), №21 — через 5 дней (повторный приём, заявка). У Барсика: запись №24 завтра, «Капли от блох» 31.10.
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
  it('группы «Сегодня / Завтра / Позже»: просроченное — в «Сегодня», записи — по дням; отметка — на сегодня и раньше', async () => {
    renderTasks()
    expect(await screen.findByRole('article', { name: 'Купить корм' })).toBeInTheDocument()
    expect(screen.getByText('Календарь')).toBeInTheDocument()
    expect(screen.getByText('Дела, записи к врачу и сроки прививок на 30 дней вперёд: Майло.')).toBeInTheDocument()
    expect(titles('Сегодня')).toEqual(['Мелоксикам, 1,5 мл', 'Купить корм', 'Мелоксикам, 1,5 мл'])
    expect(titles('Завтра')).toEqual(['Мелоксикам, 1,5 мл', 'Почистить зубы'])
    expect(titles('Позже')).toEqual([
      'Запись к врачу: Вакцинация',
      'Мелоксикам, 1,5 мл',
      'Мелоксикам, 1,5 мл',
      'Мелоксикам, 1,5 мл',
      'Запись к врачу: Повторный приём',
    ])
    expect(within(group('Сегодня')).getByText('среда, 28 октября')).toBeInTheDocument()
    expect(within(group('Завтра')).getByText('четверг, 29 октября')).toBeInTheDocument()
    expect(within(group('Позже')).getByText('с 30 октября по 27 ноября')).toBeInTheDocument()

    const [overdue] = within(group('Сегодня')).getAllByRole('article')
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
    // В «Позже» дела курса тоже без отметки.
    expect(within(group('Позже')).queryByRole('button', { name: /^Выполнено/ })).not.toBeInTheDocument()

    expect(screen.queryByRole('region', { name: 'Дальше 30 дней' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Появится на этапе/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Показать ещё неделю' })).not.toBeInTheDocument()
  })

  it('записи — время, причина, клиника и врач, статус и ссылка на запись', async () => {
    renderTasks()
    const vaccination = await screen.findByRole('article', { name: 'Запись к врачу: Вакцинация' })
    expect(within(vaccination).getByText('пятница, 30 октября, 10:00')).toBeInTheDocument()
    expect(within(vaccination).getByText('ВетДоктор · Петров Павел Петрович')).toBeInTheDocument()
    expect(within(vaccination).getByText('Подтверждена')).toBeInTheDocument()
    expect(within(vaccination).getByText('Профилактика')).toBeInTheDocument()
    expect(within(vaccination).getByRole('link', { name: 'Подробнее, запись на пятница, 30 октября, 10:00' })).toHaveAttribute(
      'href',
      '/appointments/20',
    )
    const followUp = screen.getByRole('article', { name: 'Запись к врачу: Повторный приём' })
    expect(within(followUp).getByText('понедельник, 2 ноября, 15:30')).toBeInTheDocument()
    expect(within(followUp).getByText('ВетДоктор · Ким Елена Викторовна')).toBeInTheDocument()
    expect(within(followUp).getByText('Заявка')).toBeInTheDocument()
    expect(within(followUp).getByText('Лечение')).toBeInTheDocument()
    expect(within(followUp).getByRole('link', { name: /^Подробнее/ })).toHaveAttribute('href', '/appointments/21')
    // Записи не отмечают и не удаляют в «Делах» — отмена на странице записи.
    expect(within(followUp).queryByRole('button')).not.toBeInTheDocument()
  })

  it('«Выполнено» — одной кнопкой: дело уходит из «Сегодня», статус, фокус на календаре', async () => {
    const { user } = renderTasks()
    await user.click(await screen.findByRole('button', { name: 'Выполнено, Мелоксикам, 1,5 мл, вторник, 27 октября, 20:00' }))
    await findStatus('Выполнено: Мелоксикам, 1,5 мл.')
    await vi.waitFor(() => expect(titles('Сегодня')).toEqual(['Купить корм', 'Мелоксикам, 1,5 мл']))
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1')
    expect(readServer().reminders.find((item) => item.id === 16)?.status).toBe('done')
  })

  it('пропуск — с подтверждением; у серии статус называет следующее дело, оно в «Позже»', async () => {
    // Четверг, 29.10, 22:00 — зубы на 21:00 просрочены.
    vi.setSystemTime(new Date('2026-10-29T19:00:00Z'))
    const { user } = renderTasks()
    await user.click(await screen.findByRole('button', { name: 'Пропустить, Почистить зубы, сегодня, 21:00' }))
    const dialog = screen.getByRole('dialog', { name: 'Пропустить дело' })
    expect(within(dialog).getByText(/Следующее дело серии появится, как обычно/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Пропустить' }))
    await findStatus('Пропущено: Почистить зубы. Следующее — четверг, 5 ноября, 21:00.')
    expect(await within(group('Позже')).findByText('четверг, 5 ноября, 21:00')).toBeInTheDocument()
    expect(titles('Сегодня')).not.toContain('Почистить зубы')
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1')
  })

  it('своё дело: ошибки формы, затем добавлено со своим интервалом — в «Сегодня»', async () => {
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
    const walk = await within(group('Сегодня')).findByRole('article', { name: 'Погулять в парке' })
    expect(within(walk).getByText('Раз в 3 дня')).toBeInTheDocument()
    expect(within(walk).getByText('Уход')).toBeInTheDocument()
    expect(titles('Сегодня')).toEqual(['Мелоксикам, 1,5 мл', 'Купить корм', 'Погулять в парке', 'Мелоксикам, 1,5 мл'])
    expect(readServer().reminders.at(-1)).toMatchObject({ due_at: '2026-10-28T19:30:00+03:00', repeat_interval_days: 3, series_id: 100 })
  })

  it('удаление своего дела — с подтверждением; дело уходит из «Завтра», фокус на календаре', async () => {
    const { user } = renderTasks()
    await user.click(await screen.findByRole('button', { name: 'Удалить, Почистить зубы, завтра, 21:00' }))
    const dialog = screen.getByRole('dialog', { name: 'Удалить дело' })
    expect(within(dialog).getByText(/Повторы прекратятся/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))
    await findStatus('Дело удалено.')
    await vi.waitFor(() => expect(titles('Завтра')).toEqual(['Мелоксикам, 1,5 мл']))
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1')
  })

  it('«Дальше 30 дней»: своё дело на год вперёд видно с годом и удаляется', async () => {
    addReminder(90, 10, 'Купить витамины', '2026-12-20T10:00:00+03:00')
    const { user } = renderTasks()
    const far = await screen.findByRole('region', { name: 'Дальше 30 дней' })
    expect(within(far).getByText('с 28 ноября')).toBeInTheDocument()
    expect(within(far).getByText('воскресенье, 20 декабря, 10:00')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Добавить дело' }))
    const dialog = screen.getByRole('dialog', { name: 'Новое дело' })
    await user.type(within(dialog).getByLabelText('Название'), 'Прививка от клещей')
    fireEvent.change(within(dialog).getByLabelText('Дата'), { target: { value: '2027-06-15' } })
    fireEvent.change(within(dialog).getByLabelText('Время'), { target: { value: '10:00' } })
    await user.selectOptions(within(dialog).getByLabelText('Тип'), 'Профилактика')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить дело' }))
    await findStatus('Дело добавлено: Прививка от клещей, вторник, 15 июня 2027, 10:00.')
    const ticks = await within(far).findByRole('article', { name: 'Прививка от клещей' })
    expect(within(ticks).getByText('вторник, 15 июня 2027, 10:00')).toBeInTheDocument()
    // Дальние дела не отметить — только удалить своё.
    expect(within(ticks).queryByRole('button', { name: /^Выполнено/ })).not.toBeInTheDocument()
    // В календаре на 30 дней его нет.
    expect(titles('Позже')).not.toContain('Прививка от клещей')

    await user.click(within(ticks).getByRole('button', { name: 'Удалить, Прививка от клещей, вторник, 15 июня 2027, 10:00' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Удалить дело' })).getByRole('button', { name: 'Удалить' }))
    await findStatus('Дело удалено.')
    await vi.waitFor(() => expect(within(far).queryByRole('article', { name: 'Прививка от клещей' })).not.toBeInTheDocument())
    expect(within(far).getByRole('article', { name: 'Купить витамины' })).toBeInTheDocument()
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1')
  })

  it('длинный список дальних дел — первые 10, остальные по кнопке', async () => {
    for (let index = 0; index < 12; index += 1) {
      addReminder(200 + index, 10, `Дальнее дело ${index + 1}`, `2026-12-${String(index + 1).padStart(2, '0')}T10:00:00+03:00`)
    }
    const { user } = renderTasks()
    const far = await screen.findByRole('region', { name: 'Дальше 30 дней' })
    expect(within(far).getAllByRole('article')).toHaveLength(10)
    const more = within(far).getByRole('button', { name: 'Показать все (12)' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await user.click(more)
    expect(within(far).getAllByRole('article')).toHaveLength(12)
    expect(more).toHaveTextContent('Свернуть')
    expect(more).toHaveFocus()
  })

  it('у другого питомца — его дела, записи и сроки прививок; пустая группа — «Ничего нет»', async () => {
    updateServer((state) => {
      const vaccination = state.vaccinations.find((item) => item.id === 3)
      if (vaccination) vaccination.next_date = '2026-11-10'
    })
    localStorage.setItem('pawchito:selected-pet-id', '11')
    renderTasks()
    expect(await screen.findByRole('article', { name: 'Капли от блох' })).toBeInTheDocument()
    expect(screen.getByText('Дела, записи к врачу и сроки прививок на 30 дней вперёд: Барсик.')).toBeInTheDocument()
    expect(titles('Сегодня')).toEqual([])
    expect(within(group('Сегодня')).getByText('Ничего нет')).toBeInTheDocument()
    expect(titles('Завтра')).toEqual(['Запись к врачу: Плановый осмотр'])
    expect(within(group('Завтра')).getByText('завтра, 09:00')).toBeInTheDocument()
    expect(titles('Позже')).toEqual(['Капли от блох', 'Прививка: Нобивак Tricat Trio'])

    const due = screen.getByRole('article', { name: 'Прививка: Нобивак Tricat Trio' })
    expect(within(due).getByText('вторник, 10 ноября')).toBeInTheDocument()
    expect(within(due).getByText('Срок следующей прививки')).toBeInTheDocument()
    expect(within(due).getByText('Профилактика')).toBeInTheDocument()
    expect(within(due).getByRole('link', { name: 'Открыть в «Истории», прививка Нобивак Tricat Trio' })).toHaveAttribute(
      'href',
      '/history',
    )
  })

  it('пустой календарь — пустое состояние; дальние дела всё равно видны', async () => {
    updateServer((state) => {
      state.reminders = state.reminders.filter((item) => item.pet_id !== 11)
      state.appointments = state.appointments.filter((item) => item.pet_id !== 11)
    })
    addReminder(90, 11, 'Капли от блох', '2027-01-20T10:00:00+03:00')
    localStorage.setItem('pawchito:selected-pet-id', '11')
    renderTasks()
    expect(await screen.findByText('На 30 дней вперёд ничего не запланировано')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Сегодня' })).not.toBeInTheDocument()
    const far = await screen.findByRole('region', { name: 'Дальше 30 дней' })
    expect(within(far).getByText('среда, 20 января 2027, 10:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Добавить дело' })).toBeInTheDocument()
  })
})
