import { screen, waitFor } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppRoutes } from '../../app/routes'
import { server } from '../../mocks/node'
import { readServer, SEED_PASSWORD } from '../../mocks/server-state'
import { loginMockAs, logoutMock } from '../../mocks/session'
import { renderWithProviders } from '../../test/render'

async function submit(user: UserEvent, { current, next, repeat = next }: { current: string; next: string; repeat?: string }) {
  await user.type(await screen.findByLabelText('Временный пароль'), current)
  await user.type(screen.getByLabelText('Новый пароль'), next)
  await user.type(screen.getByLabelText('Повтор пароля'), repeat)
  await user.click(screen.getByRole('button', { name: 'Сменить пароль' }))
}

beforeEach(() => {
  loginMockAs('clinic-new@example.com')
})

describe('ChangePasswordPage', () => {
  it('клиника с временным паролем: смена пароля, потом её записи', async () => {
    const { user, queryClient } = renderWithProviders(<AppRoutes />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Смена пароля' })).toBeInTheDocument()
    expect(screen.getByText('Администратор выдал временный пароль. Придумайте новый, чтобы продолжить.')).toBeInTheDocument()

    await submit(user, { current: SEED_PASSWORD, next: 'newsecret1' })

    expect(await screen.findByRole('heading', { level: 1, name: 'Записи' })).toBeInTheDocument()
    const account = readServer().accounts.find((item) => item.email === 'clinic-new@example.com')
    expect(account).toMatchObject({ password: 'newsecret1', must_change_password: false })
    // Страница записей уже запросила данные: без ожидания ответ долетит до следующего теста и сорвёт его проверку входа.
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('неверный временный пароль — ошибка у поля, фокус на нём', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: '/change-password' })
    await submit(user, { current: 'wrong-pass', next: 'newsecret1' })
    expect(await screen.findByText('Неверный текущий пароль.')).toBeInTheDocument()
    expect(screen.getByLabelText('Временный пароль')).toHaveFocus()
  })

  it('повтор не совпал — ошибка без запроса', async () => {
    let calls = 0
    server.use(
      http.post('*/api/auth/change-password', () => {
        calls += 1
      }),
    )
    const { user } = renderWithProviders(<AppRoutes />, { route: '/change-password' })
    await submit(user, { current: SEED_PASSWORD, next: 'newsecret1', repeat: 'newsecret2' })
    expect(screen.getByText('Пароли не совпадают')).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls).toBe(0)
  })

  it('«Выйти» — на экран входа', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: '/change-password' })
    await user.click(await screen.findByRole('button', { name: 'Выйти' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Вход' })).toBeInTheDocument()
  })

  it('без временного пароля — главная роли', async () => {
    loginMockAs('owner')
    renderWithProviders(<AppRoutes />, { route: '/change-password' })
    expect(await screen.findByRole('heading', { level: 1, name: /Анна Смирнова/ })).toBeInTheDocument()
  })

  it('гость — экран входа', async () => {
    logoutMock()
    renderWithProviders(<AppRoutes />, { route: '/change-password' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Вход' })).toBeInTheDocument()
  })
})
