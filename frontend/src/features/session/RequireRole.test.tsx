import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { server } from '../../mocks/node'
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
})
