import { act, screen, waitFor } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { meQuery } from '../../api/queries'
import { server } from '../../mocks/node'
import { updateServer } from '../../mocks/server-state'
import { loginMockAs, logoutMock } from '../../mocks/session'
import { createGate } from '../../test/gate'
import { renderWithProviders } from '../../test/render'
import { recordRequests, settle } from '../../test/requests'
import { TOO_MANY_ATTEMPTS } from '../../test/texts'
import { LoginPage } from './LoginPage'

function LocationProbe() {
  const location = useLocation()
  return (
    <>
      <output data-testid="state">{JSON.stringify(location.state)}</output>
      <output data-testid="url">{`${location.pathname}${location.search}${location.hash}`}</output>
    </>
  )
}

function renderLogin(state?: unknown, route = '/login') {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<p>Главная владельца</p>} />
        <Route path="/clinic/appointments" element={<p>Записи клиники</p>} />
        <Route path="/recover" element={<p>Страница восстановления</p>} />
        <Route path="/register" element={<p>Страница регистрации</p>} />
      </Routes>
      <LocationProbe />
    </>,
    { route, state },
  )
}

async function signInAs(user: UserEvent, email: string, password: string) {
  await user.type(await screen.findByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Пароль'), password)
  await user.click(screen.getByRole('button', { name: 'Войти' }))
}

/** Считает запросы /users/me; начиная с номера holdFrom, ответ мок-сервера ждёт release. */
function holdMe(holdFrom: number) {
  const gate = createGate()
  const calls = { me: 0 }
  server.use(
    http.get('*/api/users/me', async () => {
      calls.me += 1
      if (calls.me >= holdFrom) await gate.opened
      // Ничего не возвращаем — запрос уходит в обычный обработчик моков.
    }),
  )
  return { calls, release: gate.release }
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
    expect((await screen.findByRole('alert')).textContent).toBe(TOO_MANY_ATTEMPTS)
  })

  it('пустые поля — проверка без запроса, фокус на email', async () => {
    const { user } = renderLogin()
    await user.click(await screen.findByRole('button', { name: 'Войти' }))
    expect(screen.getAllByText('Заполните поле')).toHaveLength(2)
    expect(screen.getByLabelText('Email')).toHaveFocus()
  })

  it.each([500, 429])('ответ %i: фокус остаётся на кнопке; пока идёт вход, повторный клик запрос не шлёт', async (status) => {
    const gate = createGate()
    server.use(
      http.post('*/api/auth/login', async () => {
        await gate.opened
        return HttpResponse.json({ detail: 'Сбой' }, { status })
      }),
    )
    const logins = recordRequests('post', '*/api/auth/login')
    const { user } = renderLogin()
    await user.type(await screen.findByLabelText('Email'), 'owner@example.com')
    await user.type(screen.getByLabelText('Пароль'), 'pawchito1')
    const button = screen.getByRole('button', { name: 'Войти' })
    act(() => button.focus())
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('button', { name: 'Входим…' })).toBe(button)
    expect(button).toHaveAttribute('aria-disabled', 'true')
    await waitFor(() => expect(logins.count).toBe(1))
    await user.click(button)
    await user.keyboard('{Enter}')
    await settle()
    expect(logins.count).toBe(1)

    gate.release()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(button).toHaveTextContent('Войти')
    expect(button).toHaveAttribute('aria-disabled', 'false')
    expect(button).toHaveFocus()
    expect(logins.count).toBe(1)
  })

  it('уже вошедшего сразу уводит на главную роли', async () => {
    loginMockAs('owner')
    renderLogin()
    expect(await screen.findByText('Главная владельца')).toBeInTheDocument()
  })

  it('перезапрос сессии после ошибки не прячет форму: ввод и фокус на месте', async () => {
    const me = holdMe(2)
    const { user, queryClient } = renderLogin()
    const email = await screen.findByLabelText('Email')
    await user.type(email, 'owner@')

    let refetching!: Promise<void>
    act(() => {
      refetching = queryClient.refetchQueries({ queryKey: meQuery.queryKey })
    })
    expect(queryClient.isFetching({ queryKey: meQuery.queryKey })).toBe(1)
    await user.type(email, 'example.com')

    expect(screen.getByLabelText('Email')).toBe(email)
    expect(email).toHaveValue('owner@example.com')
    expect(email).toHaveFocus()
    expect(screen.queryByText('Проверяем вход')).not.toBeInTheDocument()

    me.release()
    await act(() => refetching)
    expect(me.calls.me).toBe(2)
    expect(screen.getByLabelText('Email')).toBe(email)
  })

  it('во время входа перезапрос сессии не сменяет форму спиннером', async () => {
    const me = holdMe(2)
    const { user } = renderLogin()
    await signInAs(user, 'owner@example.com', 'pawchito1')
    await waitFor(() => expect(me.calls.me).toBe(2))

    // Любая перерисовка, пока /users/me после входа не ответил, — например, ввод в поле.
    await user.type(screen.getByLabelText('Пароль'), 'x')
    expect(screen.getByRole('button', { name: 'Входим…' })).toBeInTheDocument()
    expect(screen.queryByText('Проверяем вход')).not.toBeInTheDocument()

    me.release()
    expect(await screen.findByText('Главная владельца')).toBeInTheDocument()
  })

  it('причина выхода: показывается, получает фокус и убирается из истории', async () => {
    renderLogin({ reason: 'expired' })
    const reason = await screen.findByText('Сессия истекла — войдите снова')
    expect(reason).toHaveFocus()
    expect(screen.getByTestId('state')).toHaveTextContent('null')
  })

  it('причина убирается из истории, query и hash адреса остаются', async () => {
    renderLogin({ reason: 'expired' }, '/login?from=mail#form')
    expect(await screen.findByText('Сессия истекла — войдите снова')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('null'))
    expect(screen.getByTestId('url')).toHaveTextContent('/login?from=mail#form')
  })

  it('email из state подставляется в поле', async () => {
    renderLogin({ reason: 'password-recovered', email: 'owner@example.com' })
    expect(await screen.findByText('Пароль изменён — войдите с новым паролем')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('owner@example.com')
  })

  it('ссылки на восстановление и регистрацию', async () => {
    const { user } = renderLogin()
    expect(await screen.findByRole('link', { name: 'Зарегистрироваться' })).toHaveAttribute('href', '/register')
    await user.click(screen.getByRole('link', { name: 'Забыли пароль?' }))
    expect(await screen.findByText('Страница восстановления')).toBeInTheDocument()
  })
})
