import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { server } from '../../mocks/node'
import { readServer, toUser } from '../../mocks/server-state'
import { loginMockAs, logoutMock } from '../../mocks/session'
import { renderWithProviders } from '../../test/render'
import { RequireRole } from './RequireRole'

function renderGuarded() {
  return renderWithProviders(
    <Routes>
      <Route
        path="/"
        element={
          <RequireRole allow={['owner']}>
            <p>Кабинет владельца</p>
          </RequireRole>
        }
      />
      <Route path="/clinic/appointments" element={<p>Записи клиники</p>} />
      <Route path="/login" element={<p>Экран входа</p>} />
      <Route path="/change-password" element={<p>Смена пароля</p>} />
    </Routes>,
  )
}

describe('RequireRole', () => {
  it('пускает подходящую роль', async () => {
    renderGuarded()
    expect(await screen.findByText('Кабинет владельца')).toBeInTheDocument()
  })

  it('отправляет другую роль в её раздел', async () => {
    loginMockAs('clinic')
    renderGuarded()
    expect(await screen.findByText('Записи клиники')).toBeInTheDocument()
  })

  it('отправляет гостя на вход', async () => {
    logoutMock()
    renderGuarded()
    expect(await screen.findByText('Экран входа')).toBeInTheDocument()
  })

  it('при ошибке сервера показывает повтор, а не вход', async () => {
    server.use(http.get('*/api/users/me', () => HttpResponse.json({ detail: 'Ошибка сервера' }, { status: 500 })))
    renderGuarded()
    expect(await screen.findByRole('heading', { name: 'Не удалось загрузить данные' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    expect(screen.queryByText('Экран входа')).not.toBeInTheDocument()
  })

  it('временный пароль — на смену пароля, раньше проверки роли', async () => {
    loginMockAs('clinic-new@example.com')
    renderGuarded()
    expect(await screen.findByText('Смена пароля')).toBeInTheDocument()
  })

  it('нет поля must_change_password — пускает, без петли через смену пароля', async () => {
    server.use(
      http.get('*/api/users/me', () => {
        const owner = readServer().accounts.find((item) => item.email === 'owner@example.com')!
        return HttpResponse.json({ ...toUser(owner), must_change_password: undefined })
      }),
    )
    renderGuarded()
    expect(await screen.findByText('Кабинет владельца')).toBeInTheDocument()
  })

  // Токен живёт в памяти модуля до afterEach — поэтому один аккаунт на тест.
  function renderChangeScreen() {
    return renderWithProviders(
      <Routes>
        <Route
          path="/change-password"
          element={
            <RequireRole allow={['owner', 'clinic', 'admin']} passwordChange>
              <p>Форма смены пароля</p>
            </RequireRole>
          }
        />
        <Route path="/" element={<p>Кабинет владельца</p>} />
      </Routes>,
      { route: '/change-password' },
    )
  }

  it('экран смены пароля с временным паролем — показывается', async () => {
    loginMockAs('clinic-new@example.com')
    renderChangeScreen()
    expect(await screen.findByText('Форма смены пароля')).toBeInTheDocument()
  })

  it('экран смены пароля без временного пароля — главная роли', async () => {
    renderChangeScreen()
    expect(await screen.findByText('Кабинет владельца')).toBeInTheDocument()
  })
})
