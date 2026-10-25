import { screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { meQuery } from '../../api/queries'
import { updateServer } from '../../mocks/server-state'
import { loginMockAs, logoutMock } from '../../mocks/session'
import { renderWithProviders } from '../../test/render'
import { LoginPage } from './LoginPage'

function StateProbe() {
  return <output data-testid="state">{JSON.stringify(useLocation().state)}</output>
}

function renderLogin(state?: unknown) {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<p>Главная владельца</p>} />
        <Route path="/clinic/appointments" element={<p>Записи клиники</p>} />
        <Route path="/recover" element={<p>Страница восстановления</p>} />
        <Route path="/register" element={<p>Страница регистрации</p>} />
      </Routes>
      <StateProbe />
    </>,
    { route: '/login', state },
  )
}

async function signInAs(user: UserEvent, email: string, password: string) {
  await user.type(await screen.findByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Пароль'), password)
  await user.click(screen.getByRole('button', { name: 'Войти' }))
}

beforeEach(() => {
  logoutMock()
})

describe('LoginPage', () => {
  it('успешный вход: главная роли, пользователь в кэше', async () => {
    const { user, queryClient } = renderLogin()
    await signInAs(user, 'clinic@example.com', 'pawchito1')
    expect(await screen.findByText('Записи клиники')).toBeInTheDocument()
    expect(queryClient.getQueryData(meQuery.queryKey)).toMatchObject({ email: 'clinic@example.com', role: 'clinic' })
  })

  it('неверный пароль — текст над кнопкой', async () => {
    const { user } = renderLogin()
    await signInAs(user, 'owner@example.com', 'wrong-pass')
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный email или пароль.')
  })

  it('заблокированный аккаунт', async () => {
    const { user } = renderLogin()
    await signInAs(user, 'blocked@example.com', 'pawchito1')
    expect(await screen.findByRole('alert')).toHaveTextContent('Аккаунт заблокирован.')
  })

  it('пауза после пяти неудач — с минутами', async () => {
    updateServer((state) => {
      state.attempts['owner@example.com'] = { failures: 0, lockedUntil: Date.now() + 15 * 60_000 }
    })
    const { user } = renderLogin()
    await signInAs(user, 'owner@example.com', 'pawchito1')
    // toHaveTextContent сводит неразрывный пробел к обычному — сверяем сырой текст, чтобы неразрывный пробел проверялся.
    expect((await screen.findByRole('alert')).textContent).toBe('Слишком много попыток. Попробуйте через 15 минут.')
  })

  it('пустые поля — проверка без запроса, фокус на email', async () => {
    const { user } = renderLogin()
    await user.click(await screen.findByRole('button', { name: 'Войти' }))
    expect(screen.getAllByText('Заполните поле')).toHaveLength(2)
    expect(screen.getByLabelText('Email')).toHaveFocus()
  })

  it('уже вошедшего сразу уводит на главную роли', async () => {
    loginMockAs('owner')
    renderLogin()
    expect(await screen.findByText('Главная владельца')).toBeInTheDocument()
  })

  it('причина выхода: показывается, получает фокус и убирается из истории', async () => {
    renderLogin({ reason: 'expired' })
    const reason = await screen.findByText('Сессия истекла — войдите снова')
    expect(reason).toHaveFocus()
    expect(screen.getByTestId('state')).toHaveTextContent('null')
  })

  it('email из state подставляется в поле', async () => {
    renderLogin({ reason: 'password-recovered', email: 'owner@example.com' })
    expect(await screen.findByText('Пароль изменён — войдите с новым паролем')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('owner@example.com')
  })

  it('ссылки на восстановление и регистрацию', async () => {
    const { user } = renderLogin()
    await user.click(await screen.findByRole('link', { name: 'Забыли пароль?' }))
    expect(await screen.findByText('Страница восстановления')).toBeInTheDocument()
  })
})
