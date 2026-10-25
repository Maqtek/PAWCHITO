import { act, screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { getAccessToken } from '../../api/auth-token'
import { meQuery } from '../../api/queries'
import { server } from '../../mocks/node'
import { logoutMock } from '../../mocks/session'
import { renderWithProviders } from '../../test/render'
import { LoginPage } from './LoginPage'
import { RegisterPage } from './RegisterPage'

function renderRegister() {
  return renderWithProviders(
    <Routes>
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<p>Главная владельца</p>} />
      <Route path="/login" element={<LoginPage />} />
    </Routes>,
    { route: '/register' },
  )
}

async function fill(user: UserEvent, values: { name: string; email: string; password: string; repeat: string }) {
  await user.type(await screen.findByLabelText('Имя'), values.name)
  await user.type(screen.getByLabelText('Email'), values.email)
  await user.type(screen.getByLabelText('Пароль'), values.password)
  await user.type(screen.getByLabelText('Повтор пароля'), values.repeat)
  await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))
}

beforeEach(() => {
  logoutMock()
})

describe('RegisterPage', () => {
  it('клиентские проверки: имя из пробелов, формат email, 7 символов, несовпадение', async () => {
    const { user } = renderRegister()
    await fill(user, { name: '   ', email: 'owner', password: '1234567', repeat: '7654321' })

    expect(screen.getByText('Заполните поле')).toBeInTheDocument()
    expect(screen.getByText('Введите email в формате name@example.com')).toBeInTheDocument()
    expect(screen.getByText('Пароль — не короче 8 символов')).toBeInTheDocument()
    expect(screen.getByText('Пароли не совпадают')).toBeInTheDocument()
    expect(screen.getByLabelText('Имя')).toHaveFocus()
  })

  it('409: ошибка у поля email со ссылкой «Войти», email переходит в форму входа', async () => {
    const { user } = renderRegister()
    await fill(user, { name: 'Анна', email: 'OWNER@example.com', password: 'pawchito1', repeat: 'pawchito1' })

    const error = await screen.findByText(/Этот email уже зарегистрирован\./)
    await user.click(within(error).getByRole('link', { name: 'Войти' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Вход' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Email')).toHaveValue('OWNER@example.com')
  })

  it('422 от сервера — под полем и текст над кнопкой', async () => {
    server.use(
      http.post('*/api/auth/register', () =>
        HttpResponse.json(
          { detail: [{ loc: ['body', 'full_name'], msg: 'Имя содержит недопустимые символы', type: 'value_error' }] },
          { status: 422 },
        ),
      ),
    )
    const { user } = renderRegister()
    await fill(user, { name: 'Анна', email: 'new@example.com', password: 'pawchito1', repeat: 'pawchito1' })

    expect(await screen.findByText('Имя содержит недопустимые символы')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Проверьте поля формы.')
    expect(screen.getByLabelText('Имя')).toHaveFocus()
  })

  it('успех: код, «Продолжить» после отметки, главная, пользователь в кэше', async () => {
    const { user, queryClient } = renderRegister()
    await fill(user, { name: '  Новый Владелец ', email: 'new@example.com', password: 'pawchit8', repeat: 'pawchit8' })

    expect(await screen.findByRole('heading', { name: 'Сохраните код восстановления' })).toBeInTheDocument()
    expect(screen.getByText(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/)).toBeInTheDocument()
    expect(getAccessToken()).not.toBeNull()

    const next = screen.getByRole('button', { name: 'Продолжить' })
    expect(next).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Код сохранён в надёжном месте' }))
    await user.click(next)

    expect(await screen.findByText('Главная владельца')).toBeInTheDocument()
    expect(queryClient.getQueryData(meQuery.queryKey)).toMatchObject({ email: 'new@example.com', full_name: 'Новый Владелец' })
  })

  it('экран кода: перезапрос сессии не уводит с него, хотя пользователь уже вошёл', async () => {
    const { user, queryClient } = renderRegister()
    await fill(user, { name: 'Анна', email: 'new@example.com', password: 'pawchito1', repeat: 'pawchito1' })
    expect(await screen.findByRole('heading', { name: 'Сохраните код восстановления' })).toBeInTheDocument()

    await act(() => queryClient.invalidateQueries())

    expect(screen.getByRole('heading', { name: 'Сохраните код восстановления' })).toBeInTheDocument()
    expect(screen.queryByText('Главная владельца')).not.toBeInTheDocument()
  })
})
