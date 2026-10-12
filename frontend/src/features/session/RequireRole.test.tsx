import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { setMockRole } from '../../mocks/session'
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
    setMockRole('clinic')
    renderGuarded()
    expect(await screen.findByText('Записи клиники')).toBeInTheDocument()
  })

  it('отправляет гостя на вход', async () => {
    setMockRole('guest')
    renderGuarded()
    expect(await screen.findByText('Экран входа')).toBeInTheDocument()
  })
})
