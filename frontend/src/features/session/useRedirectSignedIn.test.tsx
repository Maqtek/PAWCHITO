import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { loginMockAs, logoutMock } from '../../mocks/session'
import { renderWithProviders } from '../../test/render'
import { useRedirectSignedIn } from './useRedirectSignedIn'

function Probe({ enabled }: { enabled?: boolean }) {
  const { checking } = useRedirectSignedIn(enabled)
  return <p>{checking ? 'Проверяем' : 'Форма'}</p>
}

function renderProbe(enabled?: boolean) {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<Probe enabled={enabled} />} />
      <Route path="/" element={<p>Главная владельца</p>} />
      <Route path="/clinic/appointments" element={<p>Записи клиники</p>} />
    </Routes>,
    { route: '/login' },
  )
}

describe('useRedirectSignedIn', () => {
  it('вошедшего владельца уводит на его главную', async () => {
    renderProbe()
    expect(await screen.findByText('Главная владельца')).toBeInTheDocument()
  })

  it('вошедшую клинику — в её записи', async () => {
    loginMockAs('clinic')
    renderProbe()
    expect(await screen.findByText('Записи клиники')).toBeInTheDocument()
  })

  it('гость остаётся на странице', async () => {
    logoutMock()
    renderProbe()
    expect(await screen.findByText('Форма')).toBeInTheDocument()
  })

  it('выключенный хук никуда не уводит', async () => {
    renderProbe(false)
    expect(screen.getByText('Форма')).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(screen.getByText('Форма')).toBeInTheDocument()
  })
})
