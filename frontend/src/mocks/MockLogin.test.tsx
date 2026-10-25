import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { getAccessToken } from '../api/auth-token'
import { renderWithProviders } from '../test/render'
import { MockLogin } from './MockLogin'
import { server } from './node'
import { readServer, updateServer } from './server-state'
import { logoutMock, readMockCookie } from './session'

function renderLogin() {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<MockLogin />} />
      <Route path="/clinic/appointments" element={<p>Записи клиники</p>} />
    </Routes>,
    { route: '/login' },
  )
}

describe('MockLogin', () => {
  it('«Клиника» входит через POST /auth/login и ведёт в записи клиники', async () => {
    logoutMock()
    const { user } = renderLogin()

    await user.click(screen.getByRole('button', { name: 'Клиника' }))

    expect(await screen.findByText('Записи клиники')).toBeInTheDocument()
    expect(getAccessToken()).toBe('mock-access.6.1')
    expect(readMockCookie()).not.toBeNull()
  })

  it('ошибка входа — текстом под кнопками', async () => {
    server.use(http.post('*/api/auth/login', () => HttpResponse.json({ detail: 'Ошибка' }, { status: 500 })))
    const { user } = renderLogin()

    await user.click(screen.getByRole('button', { name: 'Владелец' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен. Попробуйте через несколько минут.',
    )
  })

  it('«Сбросить моки» возвращает seed и стирает cookie', async () => {
    updateServer((state) => {
      state.accounts[0].full_name = 'Изменённое имя'
    })
    const { user } = renderLogin()

    await user.click(screen.getByRole('button', { name: 'Сбросить моки' }))

    expect(readServer().accounts[0].full_name).toBe('Анна Смирнова')
    expect(readMockCookie()).toBeNull()
  })
})
