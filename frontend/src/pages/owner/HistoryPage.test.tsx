import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../app/routes'
import { server } from '../../mocks/node'
import { newObservation, readServer, updateServer } from '../../mocks/server-state'
import { loginMockAs, resetMockServer } from '../../mocks/session'
import { renderWithProviders } from '../../test/render'

const renderHistory = () => renderWithProviders(<AppRoutes />, { route: '/history' })

/** role="status" есть и у спиннеров, поэтому статус страницы ищем по тексту и проверяем, что он в live-регионе. */
async function findStatus(text: string) {
  const message = await screen.findByText(text)
  expect(message.closest('[role="status"]')).not.toBeNull()
  return message
}

const section = (name: string) => screen.getByRole('region', { name })
const titles = (name: string) =>
  within(section(name))
    .queryAllByRole('article')
    .map((item) => within(item).getByRole('heading').textContent)

const feed = () => section('Лента истории')
/** Дни ленты по порядку. */
const feedDays = () =>
  within(feed())
    .queryAllByRole('heading', { level: 3 })
    .map((heading) => heading.textContent)
/** Заголовки элементов ленты по порядку; дата — у дня. */
const feedTitles = () =>
  within(feed())
    .queryAllByRole('article')
    .map((item) => within(item).getByRole('heading', { level: 4 }).textContent)

describe('HistoryPage', () => {
  it('разделы выбранного питомца и лента; записи клиники — только для чтения', async () => {
    renderHistory()
    expect(await screen.findByRole('article', { name: 'Аллергия на курицу' })).toBeInTheDocument()
    expect(screen.getByText('Особенности здоровья, дневник, прививки и лента истории: Майло.')).toBeInTheDocument()
    expect(titles('Особенности здоровья')).toEqual(['Аллергия на курицу', 'Дисплазия тазобедренных суставов'])

    const dysplasia = screen.getByRole('article', { name: 'Дисплазия тазобедренных суставов' })
    expect(within(dysplasia).getByText('Внесено клиникой')).toBeInTheDocument()
    expect(within(dysplasia).queryByRole('button')).not.toBeInTheDocument()

    expect(await within(section('Дневник')).findByRole('article', { name: '24 октября 2026' })).toBeInTheDocument()
    expect(titles('Дневник')).toEqual(['24 октября 2026', '20 октября 2026', '10 октября 2026'])
    const fromClinic = within(section('Дневник')).getByRole('article', { name: '10 октября 2026' })
    expect(within(fromClinic).getByText('31,5 кг')).toBeInTheDocument()
    expect(within(fromClinic).queryByRole('button')).not.toBeInTheDocument()

    expect(await within(section('Прививки')).findByRole('article', { name: 'Нобивак DHPPi' })).toBeInTheDocument()
    expect(titles('Прививки')).toEqual(['Нобивак DHPPi', 'Нобивак Rabies'])
    // Лента — под разделами; её порядок по seed проверяется ниже, при зафиксированной дате.
    expect(await within(feed()).findByRole('article', { name: 'Наблюдение 24 октября 2026' })).toBeInTheDocument()
  })

  it('смена питомца в переключателе — записи другого питомца; просроченная прививка отмечена', async () => {
    const { user } = renderHistory()
    await screen.findByRole('article', { name: 'Аллергия на курицу' })
    await user.click(screen.getByRole('button', { name: /^Питомец: Майло/ }))
    await user.click(screen.getByRole('button', { name: /Барсик/ }))
    expect(await screen.findByText('Особенностей пока нет')).toBeInTheDocument()
    expect(await within(section('Дневник')).findByRole('article', { name: '22 октября 2026' })).toBeInTheDocument()
    const trio = await within(section('Прививки')).findByRole('article', { name: 'Нобивак Tricat Trio' })
    expect(within(trio).getByText('Просрочена')).toBeInTheDocument()
    expect(await within(feed()).findByRole('article', { name: 'Прививка: Нобивак Tricat Trio 1 июня 2025' })).toBeInTheDocument()
    expect(feedTitles()).toEqual(['Наблюдение', 'Прививка: Нобивак Tricat Trio'])
  })

  it('питомцев нет — приглашение добавить питомца', async () => {
    updateServer((state) => {
      state.pets = state.pets.filter((pet) => pet.owner_id !== 1)
    })
    renderHistory()
    expect(await screen.findByText('Сначала добавьте питомца')).toBeInTheDocument()
    // Вторая такая же ссылка — у переключателя в шапке: обе ведут на страницу питомцев.
    for (const link of screen.getAllByRole('link', { name: 'Добавить питомца' })) {
      expect(link).toHaveAttribute('href', '/pets')
    }
  })

  it('особенность: добавить, изменить, в архив — с фокусом на списке', async () => {
    const { user } = renderHistory()
    await screen.findByRole('article', { name: 'Аллергия на курицу' })
    await user.click(within(section('Особенности здоровья')).getByRole('button', { name: 'Добавить: особенности здоровья' }))
    let dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('Тип'), 'Хроническое заболевание')
    await user.type(within(dialog).getByLabelText('Название'), 'Гастрит')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }))
    await findStatus('Особенность здоровья добавлена.')
    expect(titles('Особенности здоровья')).toContain('Гастрит')

    await user.click(screen.getByRole('button', { name: 'Изменить, Гастрит' }))
    dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Комментарий'), 'Обострения осенью')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await findStatus('Особенность здоровья сохранена.')
    expect(screen.getByText('Обострения осенью')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'В архив, Гастрит' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'В архив' }))
    await findStatus('Особенность здоровья перенесена в архив.')
    expect(titles('Особенности здоровья')).not.toContain('Гастрит')
    expect(within(section('Особенности здоровья')).getByRole('list').parentElement).toHaveFocus()
  })

  it('наблюдение: добавить и исправить своё', async () => {
    const { user } = renderHistory()
    // Разделы появляются, когда загрузился выбранный питомец.
    await screen.findByRole('region', { name: 'Дневник' })
    await within(section('Дневник')).findByRole('article', { name: '24 октября 2026' })
    await user.click(within(section('Дневник')).getByRole('button', { name: 'Новое наблюдение: дневник' }))
    let dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Дата'), { target: { value: '2026-10-25' } })
    await user.type(within(dialog).getByLabelText('Заметка'), 'Съел всё')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }))
    await findStatus('Наблюдение добавлено.')
    expect(await within(section('Дневник')).findByText('Съел всё')).toBeInTheDocument()
    expect(titles('Дневник')[0]).toBe('25 октября 2026')

    await user.click(screen.getByRole('button', { name: 'Изменить, наблюдение за 25 октября 2026' }))
    dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Вес'), '31')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await findStatus('Наблюдение сохранено.')
    expect(readServer().observations.find((item) => item.note === 'Съел всё')?.weight).toBe(31)
  })

  it('прививка: внести из ветпаспорта и удалить свою', async () => {
    const { user } = renderHistory()
    await screen.findByRole('region', { name: 'Прививки' })
    await within(section('Прививки')).findByRole('article', { name: 'Нобивак Rabies' })
    await user.click(within(section('Прививки')).getByRole('button', { name: 'Внести из ветпаспорта: прививки' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Название'), 'Мультикан')
    fireEvent.change(within(dialog).getByLabelText('Дата прививки'), { target: { value: '2025-09-01' } })
    fireEvent.change(within(dialog).getByLabelText('Следующая прививка'), { target: { value: '2025-08-01' } })
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }))
    expect(within(dialog).getByText('Следующая прививка — позже даты прививки')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Следующая прививка'), { target: { value: '2026-09-01' } })
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }))
    await findStatus('Прививка добавлена.')
    expect(await within(section('Прививки')).findByRole('article', { name: 'Мультикан' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Удалить, Нобивак Rabies' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }))
    await findStatus('Прививка удалена.')
    expect(titles('Прививки')).not.toContain('Нобивак Rabies')
    expect(readServer().vaccinations.some((item) => item.id === 1)).toBe(false)
  })

  it('ошибка загрузки раздела — свой «Повторить», остальные разделы работают', async () => {
    let fail = true
    server.use(
      http.get('*/api/pets/:petId/vaccinations', () =>
        fail ? HttpResponse.json({ detail: 'Ошибка' }, { status: 500 }) : undefined,
      ),
    )
    const { user } = renderHistory()
    expect(await screen.findByText('Не удалось загрузить прививки')).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Аллергия на курицу' })).toBeInTheDocument()
    fail = false
    await user.click(within(section('Прививки')).getByRole('button', { name: 'Повторить' }))
    expect(await within(section('Прививки')).findByRole('article', { name: 'Нобивак Rabies' })).toBeInTheDocument()
  })
})

/** Наблюдения Майло с note — по одному на каждый день из списка; id — с 200 по порядку. */
function addObservations(dates: string[]) {
  updateServer((state) => {
    dates.forEach((date, index) => {
      state.observations.push(newObservation({ id: 200 + index, pet_id: 10, date, note: `Прогулка ${index + 1}`, source: 'owner' }))
    })
  })
}

const septemberDays = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => `2026-09-${String(to - index).padStart(2, '0')}`)

describe('HistoryPage: лента истории', () => {
  // Среда, 28 октября 2026, 09:00 по Москве. Seed записей считается от «сегодня»: №22 — завершённый приём 12.10
  // с курсом Мелоксикама, №23 — отменённая клиникой 23.10, №20 и №21 — впереди.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-28T06:00:00Z'))
    resetMockServer()
    loginMockAs('owner')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('по дням от новых к старым, у каждого типа своя карточка; отменённой записи нет', async () => {
    renderHistory()
    await screen.findByRole('region', { name: 'Лента истории' })
    expect(await within(feed()).findByRole('article', { name: 'Наблюдение 24 октября 2026' })).toBeInTheDocument()
    expect(feedDays()).toEqual(['24 октября 2026', '20 октября 2026', '12 октября 2026', '10 октября 2026', '15 января 2026'])
    expect(feedTitles()).toEqual([
      'Наблюдение',
      'Наблюдение',
      'Приём у врача',
      'Курс: Мелоксикам',
      'Прививка: Нобивак DHPPi',
      'Наблюдение',
      'Прививка: Нобивак Rabies',
    ])

    const visit = within(feed()).getByRole('article', { name: 'Приём у врача 12 октября 2026' })
    for (const text of ['11:00', 'ВетДоктор', 'Петров Павел Петрович', 'Растяжение связок задней лапы']) {
      expect(within(visit).getByText(text)).toBeInTheDocument()
    }
    expect(within(visit).getByRole('link', { name: 'Подробнее о приёме, 12 октября 2026' })).toHaveAttribute('href', '/appointments/22')

    const course = within(feed()).getByRole('article', { name: 'Курс: Мелоксикам 12 октября 2026' })
    for (const text of ['1,5 мл', '20:00', '21 день, по 1 ноября 2026']) {
      expect(within(course).getByText(text)).toBeInTheDocument()
    }
    expect(within(course).getByRole('link', { name: '«Курс лечения»' })).toHaveAttribute('href', '/course')

    const vaccination = within(feed()).getByRole('article', { name: 'Прививка: Нобивак DHPPi 10 октября 2026' })
    expect(within(vaccination).getByText('Внесено клиникой')).toBeInTheDocument()
    expect(within(vaccination).getByText('Следующая — 10 октября 2027')).toBeInTheDocument()
    const weight = within(feed()).getByRole('article', { name: 'Наблюдение 10 октября 2026' })
    expect(within(weight).getByText('Внесено клиникой')).toBeInTheDocument()
    expect(within(weight).getByText('31,5 кг')).toBeInTheDocument()
    const own = within(feed()).getByRole('article', { name: 'Наблюдение 20 октября 2026' })
    expect(within(own).queryByText('Внесено клиникой')).not.toBeInTheDocument()
    for (const text of ['Ниже обычного', 'Хромает на заднюю лапу после прогулки']) {
      expect(within(own).getAllByText(text).length).toBeGreaterThan(0)
    }

    // Запись №23, отменённая клиникой 23 октября, и предстоящие записи в ленту не входят.
    expect(within(feed()).queryByText('23 октября 2026')).not.toBeInTheDocument()
    expect(within(feed()).queryByText(/Врач заболела/)).not.toBeInTheDocument()
    expect(within(feed()).getAllByRole('link', { name: /^Подробнее о приёме/ })).toHaveLength(1)
    // Всё уместилось на одной странице — подгружать нечего.
    expect(within(feed()).queryByRole('button', { name: 'Показать ещё' })).not.toBeInTheDocument()
  })

  it('«Показать ещё» — следующая страница с даты последнего элемента; день не разрывается и не повторяется', async () => {
    // 7 элементов seed и 18 наблюдений: по одному с 1 по 16 сентября и ещё два 3 сентября. Страница — 20 элементов:
    // двадцатый — первый из трёх за 3 сентября, поэтому первая страница добирает весь день.
    addObservations([...septemberDays(1, 16), '2026-09-03', '2026-09-03'])
    const { user } = renderHistory()
    await screen.findByRole('region', { name: 'Лента истории' })
    await within(feed()).findByRole('article', { name: 'Наблюдение 24 октября 2026' })
    expect(within(feed()).getAllByRole('article')).toHaveLength(22)
    expect(feedDays().at(-1)).toBe('3 сентября 2026')
    expect(within(feed()).getAllByRole('article', { name: 'Наблюдение 3 сентября 2026' })).toHaveLength(3)
    expect(within(feed()).queryByText('15 января 2026')).not.toBeInTheDocument()

    await user.click(within(feed()).getByRole('button', { name: 'Показать ещё' }))
    expect(await within(feed()).findByRole('article', { name: 'Прививка: Нобивак Rabies 15 января 2026' })).toBeInTheDocument()
    expect(within(feed()).getAllByRole('article')).toHaveLength(25)
    expect(within(feed()).getAllByRole('article', { name: 'Наблюдение 3 сентября 2026' })).toHaveLength(3)
    expect(feedDays().slice(-3)).toEqual(['2 сентября 2026', '1 сентября 2026', '15 января 2026'])
    // Фокус — на первом новом элементе; страница меньше лимита — конец ленты, кнопки больше нет.
    expect(within(feed()).getByRole('article', { name: 'Наблюдение 2 сентября 2026' })).toHaveFocus()
    expect(within(feed()).queryByRole('button', { name: 'Показать ещё' })).not.toBeInTheDocument()
    expect(within(feed()).getByText('Раньше записей нет.')).toBeInTheDocument()
  })

  it('следующая страница не загрузилась — ошибка и та же кнопка; пустая страница — конец ленты', async () => {
    // Ровно 20 элементов: первая страница полная, следующая придёт пустой.
    addObservations(septemberDays(1, 13))
    let fail = true
    server.use(
      http.get('*/api/pets/:petId/timeline', ({ request }) =>
        fail && new URL(request.url).searchParams.has('before')
          ? HttpResponse.json({ detail: 'Ошибка' }, { status: 500 })
          : undefined,
      ),
    )
    const { user } = renderHistory()
    await screen.findByRole('region', { name: 'Лента истории' })
    await within(feed()).findByRole('article', { name: 'Прививка: Нобивак Rabies 15 января 2026' })
    expect(within(feed()).getAllByRole('article')).toHaveLength(20)

    const more = within(feed()).getByRole('button', { name: 'Показать ещё' })
    await user.click(more)
    expect(await within(feed()).findByRole('alert')).toHaveTextContent('Не удалось загрузить записи раньше')
    expect(more).toHaveFocus()
    expect(within(feed()).getAllByRole('article')).toHaveLength(20)

    fail = false
    await user.click(more)
    const end = await within(feed()).findByText('Раньше записей нет.')
    expect(end).toHaveFocus()
    expect(within(feed()).queryByRole('alert')).not.toBeInTheDocument()
    expect(within(feed()).getAllByRole('article')).toHaveLength(20)
  })

  it('ошибка загрузки — «Повторить»; пустая лента — подсказка', async () => {
    let fail = true
    server.use(
      http.get('*/api/pets/:petId/timeline', () => (fail ? HttpResponse.json({ detail: 'Ошибка' }, { status: 500 }) : undefined)),
    )
    updateServer((state) => {
      state.observations = state.observations.filter((item) => item.pet_id !== 10)
      state.vaccinations = state.vaccinations.filter((item) => item.pet_id !== 10)
      state.appointments = state.appointments.filter((item) => item.pet_id !== 10 || item.status !== 'completed')
    })
    const { user } = renderHistory()
    await screen.findByRole('region', { name: 'Лента истории' })
    expect(await within(feed()).findByText('Не удалось загрузить ленту')).toBeInTheDocument()
    fail = false
    await user.click(within(feed()).getByRole('button', { name: 'Повторить' }))
    expect(await within(feed()).findByText('В ленте пока ничего нет')).toBeInTheDocument()
  })

  it('новое наблюдение и удалённая прививка сразу видны в ленте', async () => {
    const { user } = renderHistory()
    await screen.findByRole('region', { name: 'Лента истории' })
    await within(feed()).findByRole('article', { name: 'Наблюдение 24 октября 2026' })
    await user.click(within(section('Дневник')).getByRole('button', { name: 'Новое наблюдение: дневник' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Дата'), { target: { value: '2026-10-27' } })
    await user.type(within(dialog).getByLabelText('Заметка'), 'Съел всё')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }))
    const added = await within(feed()).findByRole('article', { name: 'Наблюдение 27 октября 2026' })
    expect(within(added).getByText('Съел всё')).toBeInTheDocument()
    expect(feedDays()[0]).toBe('27 октября 2026')

    await within(section('Прививки')).findByRole('article', { name: 'Нобивак Rabies' })
    await user.click(screen.getByRole('button', { name: 'Удалить, Нобивак Rabies' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }))
    await waitFor(() => expect(feedTitles()).not.toContain('Прививка: Нобивак Rabies'))
    expect(feedDays()).not.toContain('15 января 2026')
  })
})
