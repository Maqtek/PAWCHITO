import { act, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { getAccessToken } from '../api/auth-token'
import { queryKeys } from '../api/queries'
import { server } from '../mocks/node'
import { loginMockAs, readMockCookie } from '../mocks/session'
import { renderWithProviders } from '../test/render'
import { AppShell } from './AppShell'

function renderShell() {
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<p>Главная страница</p>} />
        <Route path="clinic/appointments" element={<p>Записи клиники</p>} />
        <Route path="pets" element={<p>Страница питомцев</p>} />
        <Route path="profile" element={<p>Страница профиля</p>} />
      </Route>
      <Route path="/login" element={<p>Экран входа</p>} />
    </Routes>,
  )
}

describe('AppShell', () => {
  it('владелец: пять разделов, переключатель питомцев, уведомления', async () => {
    renderShell()
    const nav = await screen.findByRole('navigation', { name: 'Разделы' })
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Главная',
      'Дела',
      'Курс лечения',
      'История',
      'Записи к врачу',
    ])
    expect(within(nav).getByRole('link', { name: 'Главная' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByRole('button', { name: 'Питомец: Майло. Сменить питомца' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Уведомления, непрочитанных: 3' })).toBeInTheDocument()
    expect(screen.getByText(/не ставит диагнозы/)).toBeInTheDocument()
  })

  it('клиника: свои разделы, без переключателя питомцев', async () => {
    loginMockAs('clinic')
    renderShell()
    const nav = await screen.findByRole('navigation', { name: 'Разделы' })
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Записи', 'Врачи'])
    expect(screen.queryByRole('button', { name: /Сменить питомца/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/не ставит диагнозы/)).not.toBeInTheDocument()
  })

  it('переключатель меняет и запоминает питомца', async () => {
    const { user } = renderShell()
    await user.click(await screen.findByRole('button', { name: 'Питомец: Майло. Сменить питомца' }))
    await user.click(screen.getByRole('button', { name: 'Кошка Барсик' }))

    expect(screen.getByRole('button', { name: 'Питомец: Барсик. Сменить питомца' })).toBeInTheDocument()
    expect(localStorage.getItem('pawchito:selected-pet-id')).toBe('11')
  })

  it('имя кнопки меню пользователя начинается с видимого текста (WCAG 2.5.3)', async () => {
    renderShell()
    // В сайдбаре видны имя и роль, в шапке телефона — только аватар с инициалами.
    const desktop = await screen.findByRole('button', { name: 'Анна Смирнова, Владелец — меню пользователя' })
    expect(desktop).toHaveTextContent('Анна Смирнова')
    expect(desktop).toHaveTextContent('Владелец')
    expect(screen.getByRole('button', { name: 'Меню пользователя: Анна Смирнова' })).toHaveTextContent('АС')
  })

  it('аккаунт клиники без имени (full_name: null в UserOut бэкенда): вместо имени email, кабинет не падает', async () => {
    loginMockAs('clinic')
    server.use(
      http.get('*/api/users/me', () =>
        HttpResponse.json({
          id: 3,
          email: 'clinic@example.com',
          role: 'clinic',
          full_name: null,
          must_change_password: false,
        }),
      ),
    )
    renderShell()

    const desktop = await screen.findByRole('button', { name: 'clinic@example.com, Клиника — меню пользователя' })
    expect(desktop).toHaveTextContent('clinic@example.com')
    expect(screen.getByRole('button', { name: 'Меню пользователя: clinic@example.com' })).toHaveTextContent('CL')
  })

  it('выход: экран входа, токен сброшен, моки в гостя, выбор питомца забыт', async () => {
    localStorage.setItem('pawchito:selected-pet-id', '11')
    const { user } = renderShell()
    const [menu] = await screen.findAllByRole('button', { name: /меню пользователя/i })
    expect(getAccessToken()).not.toBeNull()
    await user.click(menu)
    await user.click(screen.getByRole('button', { name: 'Выйти' }))

    expect(await screen.findByText('Экран входа')).toBeInTheDocument()
    expect(getAccessToken()).toBeNull()
    expect(readMockCookie()).toBeNull()
    expect(localStorage.getItem('pawchito:selected-pet-id')).toBeNull()
    expect(localStorage.getItem('pawchito:logout-pending')).toBeNull()
  })

  it('ошибка загрузки питомцев: ни переключателя, ни «Добавить питомца»', async () => {
    server.use(http.get('*/api/pets', () => HttpResponse.json({ detail: 'Ошибка' }, { status: 500 })))
    const { queryClient } = renderShell()
    await screen.findByRole('navigation', { name: 'Разделы' })
    await waitFor(() => expect(queryClient.getQueryState(queryKeys.pets)?.status).toBe('error'))

    expect(screen.queryByRole('link', { name: 'Добавить питомца' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Сменить питомца/ })).not.toBeInTheDocument()
  })

  it('фоновое обновление питомцев упало — переключатель остаётся на кэше', async () => {
    const { queryClient } = renderShell()
    expect(await screen.findByRole('button', { name: 'Питомец: Майло. Сменить питомца' })).toBeInTheDocument()

    server.use(http.get('*/api/pets', () => HttpResponse.json({ detail: 'Ошибка' }, { status: 500 })))
    await act(() => queryClient.refetchQueries({ queryKey: queryKeys.pets }))

    expect(queryClient.getQueryState(queryKeys.pets)?.status).toBe('error')
    expect(screen.getByRole('button', { name: 'Питомец: Майло. Сменить питомца' })).toBeInTheDocument()
  })

  it('выход без сети: экран входа, метка «выход не завершён», выбор питомца забыт', async () => {
    server.use(http.post('*/api/auth/logout', () => HttpResponse.error()))
    localStorage.setItem('pawchito:selected-pet-id', '11')
    const { user } = renderShell()
    const [menu] = await screen.findAllByRole('button', { name: /меню пользователя/i })
    await user.click(menu)
    await user.click(screen.getByRole('button', { name: 'Выйти' }))

    expect(await screen.findByText('Экран входа')).toBeInTheDocument()
    expect(getAccessToken()).toBeNull()
    expect(localStorage.getItem('pawchito:logout-pending')).toBe('1')
    expect(localStorage.getItem('pawchito:selected-pet-id')).toBeNull()
  })
})
