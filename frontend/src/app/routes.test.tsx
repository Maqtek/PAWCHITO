import { act, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { endMockSessions, loginMockAs, logoutMock } from '../mocks/session'
import { renderWithProviders } from '../test/render'
import { AppRoutes } from './routes'

describe('маршруты', () => {
  it('владелец на главной: приветствие и карточка питомца', async () => {
    renderWithProviders(<AppRoutes />)
    expect(await screen.findByRole('heading', { level: 1, name: /Анна Смирнова/ })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Майло' })).toBeInTheDocument()
  })

  it('клиника с главной попадает в свои записи', async () => {
    loginMockAs('clinic')
    renderWithProviders(<AppRoutes />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Записи' })).toBeInTheDocument()
  })

  it('владелец не попадает в кабинет клиники', async () => {
    renderWithProviders(<AppRoutes />, { route: '/clinic/vets' })
    expect(await screen.findByRole('heading', { level: 1, name: /Анна Смирнова/ })).toBeInTheDocument()
  })

  it('гость попадает на вход и входит клиникой через моки', async () => {
    logoutMock()
    const { user } = renderWithProviders(<AppRoutes />, { route: '/tasks' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Вход' })).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'Клиника' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Записи' })).toBeInTheDocument()
  })

  it('сервер завершил сессию во время работы: экран входа с «Сессия истекла»', async () => {
    const { queryClient } = renderWithProviders(<AppRoutes />)
    expect(await screen.findByRole('heading', { level: 1, name: /Анна Смирнова/ })).toBeInTheDocument()

    endMockSessions()
    await act(() => queryClient.invalidateQueries())

    expect(await screen.findByText('Сессия истекла — войдите снова')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Вход' })).toBeInTheDocument()
  })

  it('вошедший на /register уходит на главную', async () => {
    renderWithProviders(<AppRoutes />, { route: '/register' })
    expect(await screen.findByRole('heading', { level: 1, name: /Анна Смирнова/ })).toBeInTheDocument()
  })

  it('неизвестный адрес', async () => {
    renderWithProviders(<AppRoutes />, { route: '/nope' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Страница не найдена' })).toBeInTheDocument()
  })
})
