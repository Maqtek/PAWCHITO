import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../app/routes'
import { server } from '../../mocks/node'
import { readServer, updateServer } from '../../mocks/server-state'
import { loginMockAs, resetMockServer } from '../../mocks/session'
import { renderWithProviders } from '../../test/render'
import { HomePage } from './HomePage'

describe('HomePage', () => {
  it('ошибка загрузки питомцев: сообщение и «Повторить», а не приглашение добавить первого', async () => {
    server.use(http.get('*/api/pets', () => HttpResponse.json({ detail: 'Ошибка' }, { status: 500 })))
    const { user } = renderWithProviders(<HomePage />)

    expect(await screen.findByRole('heading', { name: 'Не удалось загрузить питомцев' })).toBeInTheDocument()
    expect(screen.getByText('Проверьте соединение и попробуйте ещё раз.')).toBeInTheDocument()
    expect(screen.queryByText('Добавьте первого питомца')).not.toBeInTheDocument()

    // Сеть вернулась — «Повторить» загружает питомцев заново.
    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Повторить' }))

    expect(await screen.findByRole('heading', { name: 'Майло' })).toBeInTheDocument()
    expect(screen.queryByText('Не удалось загрузить питомцев')).not.toBeInTheDocument()
  })

  it('питомцев нет — приглашение добавить первого', async () => {
    server.use(http.get('*/api/pets', () => HttpResponse.json([])))
    renderWithProviders(<HomePage />)

    expect(await screen.findByRole('heading', { name: 'Добавьте первого питомца' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Добавить питомца' })).toHaveAttribute('href', '/pets')
    expect(screen.queryByText('Не удалось загрузить питомцев')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Сегодня' })).not.toBeInTheDocument()
  })

  it('во вкладке «Главная», а не приветствие с полным именем', async () => {
    renderWithProviders(<HomePage />)

    expect(await screen.findByRole('heading', { level: 1, name: /Анна Смирнова/ })).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Главная — PAWCHITO'))
  })
})

/** role="status" есть и у спиннеров, поэтому статус страницы ищем по тексту и проверяем, что он в live-регионе. */
async function findStatus(text: string) {
  const message = await screen.findByText(text)
  expect(message.closest('[role="status"]')).not.toBeNull()
  return message
}

const renderHome = () => renderWithProviders(<AppRoutes />, { route: '/' })
const region = (name: string) => screen.getByRole('region', { name })
const titles = () =>
  within(region('Сегодня'))
    .queryAllByRole('article')
    .map((item) => within(item).getByRole('heading').textContent)

// Среда, 28 октября 2026, 09:00 по Москве. У Майло: курс Мелоксикама в 20:00 до 1 ноября (14 из 21 доз выполнено,
// одна пропущена, доза 27.10 просрочена), «Купить корм» сегодня в 18:00, подтверждённая запись в пятницу в 10:00.
// У владельца пять уведомлений, три непрочитанных.
describe('HomePage: сводка выбранного питомца', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-28T06:00:00Z'))
    resetMockServer()
    loginMockAs('owner')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('карточка со статусом ухода, дела на сегодня с просроченными, прогресс курса, ближайшая запись', async () => {
    renderHome()
    const today = await screen.findByRole('region', { name: 'Сегодня' })
    expect(screen.getByRole('heading', { level: 2, name: 'Майло' })).toBeInTheDocument()
    const scale = screen.getByRole('list', { name: 'Статус ухода' })
    expect(within(scale).getByText('На лечении').closest('li')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('ВетДоктор, 10 октября')).toBeInTheDocument()
    expect(screen.queryByText('Появится на этапе 11 роадмапа.')).not.toBeInTheDocument()

    // Дела — по времени, просроченное первым; отметить можно каждое, удалить — только в «Делах».
    expect(titles()).toEqual(['Мелоксикам, 1,5 мл', 'Купить корм', 'Мелоксикам, 1,5 мл'])
    const [overdue, feed] = within(today).getAllByRole('article')
    expect(within(overdue).getByText('вторник, 27 октября, 20:00')).toBeInTheDocument()
    expect(within(overdue).getByText('Просрочено')).toBeInTheDocument()
    expect(within(overdue).getByText('По курсу лечения')).toBeInTheDocument()
    expect(within(feed).getByText('сегодня, 18:00')).toBeInTheDocument()
    expect(within(feed).queryByText('Просрочено')).not.toBeInTheDocument()
    expect(within(feed).getByRole('button', { name: 'Выполнено, Купить корм, сегодня, 18:00' })).toBeInTheDocument()
    expect(within(feed).getByRole('button', { name: 'Пропустить, Купить корм, сегодня, 18:00' })).toBeInTheDocument()
    expect(within(today).queryByRole('button', { name: /^Удалить/ })).not.toBeInTheDocument()
    expect(within(today).getByRole('link', { name: 'Все дела' })).toHaveAttribute('href', '/tasks')

    const courses = region('Лечение')
    expect(within(courses).getByRole('heading', { name: 'Мелоксикам, 1,5 мл' })).toBeInTheDocument()
    expect(within(courses).getByText('14 из 21 выполнено, 1 пропущено')).toBeInTheDocument()
    expect(within(courses).getByRole('progressbar', { name: 'Прогресс курса: 14 из 21 выполнено, 1 пропущено' })).toHaveAttribute(
      'aria-valuenow',
      '14',
    )
    expect(within(courses).getByRole('link', { name: 'Курс лечения' })).toHaveAttribute('href', '/course')

    const next = region('Ближайшая запись')
    expect(within(next).getByText('пятница, 30 октября, 10:00')).toBeInTheDocument()
    expect(within(next).getByText('Подтверждена')).toBeInTheDocument()
    expect(within(next).getByText('ВетДоктор · Петров Павел Петрович')).toBeInTheDocument()
    expect(within(next).getByText('Вакцинация: Плановая от бешенства')).toBeInTheDocument()
    expect(within(next).getByRole('link', { name: 'Подробнее, запись на пятница, 30 октября, 10:00' })).toHaveAttribute(
      'href',
      '/appointments/20',
    )
  })

  it('последние 5 уведомлений от новых к старым; переход отмечает прочитанным, как в колокольчике', async () => {
    const { user } = renderHome()
    const notices = await screen.findByRole('region', { name: 'Уведомления' })
    const links = await within(notices).findAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/appointments/22',
      '/appointments/20',
      '/appointments/22',
      '/appointments/23',
      '/appointments/22',
    ])
    expect(links[0]).toHaveAccessibleName(/^Новое:\s*Внесён итог приёма: Майло — на лечении/)
    expect(links[0]).toHaveTextContent('28 октября, 07:00')
    // Прочитанные — без пометки «Новое».
    expect(links.filter((link) => link.textContent?.startsWith('Новое'))).toHaveLength(3)
    expect(links[4]).toHaveTextContent(/^Клиника «ВетДоктор» подтвердила запись/)

    await user.click(within(notices).getByRole('link', { name: /^Новое:\s*Клиника «ВетДоктор» подтвердила запись/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Запись к врачу' })).toBeInTheDocument()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Уведомления, непрочитанных: 2' })).toBeInTheDocument())
    expect(readServer().notifications.find((item) => item.id === 3)?.read_at).not.toBeNull()
  })

  it('«Выполнено»: статус, дело уходит из сегодняшних, прогресс курса пересчитан, фокус на списке', async () => {
    const { user } = renderHome()
    await user.click(await screen.findByRole('button', { name: 'Выполнено, Мелоксикам, 1,5 мл, вторник, 27 октября, 20:00' }))
    await findStatus('Выполнено: Мелоксикам, 1,5 мл.')
    expect(await within(region('Лечение')).findByText('15 из 21 выполнено, 1 пропущено')).toBeInTheDocument()
    expect(titles()).toEqual(['Купить корм', 'Мелоксикам, 1,5 мл'])
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1')
    expect(region('Сегодня')).toContainElement(document.activeElement as HTMLElement)
    expect(readServer().reminders.find((item) => item.id === 16)?.status).toBe('done')
  })

  it('пропуск — с подтверждением; отмечены все дела — «На сегодня дел нет»', async () => {
    const { user } = renderHome()
    await user.click(await screen.findByRole('button', { name: 'Пропустить, Купить корм, сегодня, 18:00' }))
    const dialog = screen.getByRole('dialog', { name: 'Пропустить дело' })
    expect(within(dialog).getByText(/будет отмечено пропущенным/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Пропустить' }))
    await findStatus('Пропущено: Купить корм.')
    await vi.waitFor(() => expect(titles()).toEqual(['Мелоксикам, 1,5 мл', 'Мелоксикам, 1,5 мл']))

    await user.click(screen.getByRole('button', { name: 'Выполнено, Мелоксикам, 1,5 мл, вторник, 27 октября, 20:00' }))
    await findStatus('Выполнено: Мелоксикам, 1,5 мл.')
    await vi.waitFor(() => expect(titles()).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: 'Выполнено, Мелоксикам, 1,5 мл, сегодня, 20:00' }))
    expect(await within(region('Сегодня')).findByRole('heading', { name: 'На сегодня дел нет' })).toBeInTheDocument()
    expect(within(region('Лечение')).getByText('16 из 21 выполнено, 1 пропущено')).toBeInTheDocument()
  })

  it('питомец без курсов и дел на сегодня: пустые блоки и его ближайшая запись', async () => {
    localStorage.setItem('pawchito:selected-pet-id', '11')
    renderHome()
    expect(await screen.findByRole('heading', { name: 'На сегодня дел нет' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Барсик' })).toBeInTheDocument()
    expect(screen.getByText('Статус появится после приёма в клинике')).toBeInTheDocument()
    const courses = region('Лечение')
    expect(within(courses).getByText(/^Активных курсов нет/)).toBeInTheDocument()
    expect(within(courses).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(within(courses).queryByRole('link')).not.toBeInTheDocument()
    const next = region('Ближайшая запись')
    expect(within(next).getByText('четверг, 29 октября, 09:00')).toBeInTheDocument()
    expect(within(next).getByText('Заявка')).toBeInTheDocument()
    expect(within(next).getByRole('link', { name: /^Подробнее/ })).toHaveAttribute('href', '/appointments/24')
  })

  it('предстоящих записей нет — приглашение записаться', async () => {
    updateServer((state) => {
      for (const item of state.appointments) if (item.pet_id === 11) item.status = 'cancelled'
    })
    localStorage.setItem('pawchito:selected-pet-id', '11')
    renderHome()
    const next = await screen.findByRole('region', { name: 'Ближайшая запись' })
    expect(within(next).getByText('Предстоящих записей нет.')).toBeInTheDocument()
    expect(within(next).getByRole('link', { name: 'Записаться к врачу' })).toHaveAttribute('href', '/appointments/new')
  })

  it('сводка не загрузилась: сообщение и «Повторить»; карточка питомца и уведомления — на месте', async () => {
    server.use(http.get('*/api/home/summary', () => HttpResponse.json({ detail: 'Ошибка' }, { status: 500 })))
    const { user } = renderHome()
    expect(await screen.findByRole('heading', { name: 'Не удалось загрузить дела, курсы и записи' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Майло' })).toBeInTheDocument()
    expect(await within(region('Уведомления')).findAllByRole('link')).toHaveLength(5)
    expect(screen.queryByRole('region', { name: 'Ближайшая запись' })).not.toBeInTheDocument()

    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('region', { name: 'Сегодня' })).toBeInTheDocument()
    expect(titles()).toHaveLength(3)
    expect(screen.queryByText('Не удалось загрузить дела, курсы и записи')).not.toBeInTheDocument()
  })

  it('уведомления не загрузились — «Повторить» в своём блоке, сводка на месте', async () => {
    server.use(http.get('*/api/notifications', () => HttpResponse.json({ detail: 'Ошибка' }, { status: 500 })))
    const { user } = renderHome()
    const notices = await screen.findByRole('region', { name: 'Уведомления' })
    expect(await within(notices).findByText('Не удалось загрузить уведомления.')).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Сегодня' })).toBeInTheDocument()

    server.resetHandlers()
    await user.click(within(notices).getByRole('button', { name: 'Повторить' }))
    expect(await within(notices).findAllByRole('link')).toHaveLength(5)
  })
})
