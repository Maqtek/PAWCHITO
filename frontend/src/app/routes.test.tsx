import { act, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { endMockSessions, loginMockAs, logoutMock } from '../mocks/session'
import { renderRoute } from '../test/route'

describe('маршруты', () => {
  it('владелец на главной: приветствие и карточка питомца', async () => {
    renderRoute('/')
    expect(await screen.findByRole('heading', { level: 1, name: /Анна Смирнова/ })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Майло' })).toBeInTheDocument()
  })

  it('клиника с главной попадает в свои записи', async () => {
    loginMockAs('clinic')
    renderRoute('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Записи' })).toBeInTheDocument()
  })

  it('владелец не попадает в кабинет клиники', async () => {
    renderRoute('/clinic/vets')
    expect(await screen.findByRole('heading', { level: 1, name: /Анна Смирнова/ })).toBeInTheDocument()
  })

  it('гость попадает на вход и входит клиникой через моки', async () => {
    logoutMock()
    const { user } = renderRoute('/tasks')
    expect(await screen.findByRole('heading', { level: 1, name: 'Вход' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Email'), 'clinic@example.com')
    await user.type(screen.getByLabelText('Пароль'), 'pawchito1')
    await user.click(screen.getByRole('button', { name: 'Войти' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Записи' })).toBeInTheDocument()
  })

  it('сервер завершил сессию во время работы: экран входа с «Сессия истекла»', async () => {
    const { queryClient } = renderRoute('/')
    expect(await screen.findByRole('heading', { level: 1, name: /Анна Смирнова/ })).toBeInTheDocument()

    endMockSessions()
    await act(() => queryClient.invalidateQueries())

    expect(await screen.findByText('Сессия истекла — войдите снова')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Вход' })).toBeInTheDocument()
  })

  it.each(['/login', '/register', '/recover'])('%s: экран — единственная область main', async (route) => {
    logoutMock()
    renderRoute(route)
    const email = await screen.findByLabelText('Email')
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { level: 1 }))
    expect(screen.getByRole('main')).toContainElement(email)
  })

  it('вошедший на /register уходит на главную', async () => {
    renderRoute('/register')
    expect(await screen.findByRole('heading', { level: 1, name: /Анна Смирнова/ })).toBeInTheDocument()
  })

  it('неизвестный адрес', async () => {
    renderRoute('/nope')
    expect(await screen.findByRole('heading', { level: 1, name: 'Страница не найдена' })).toBeInTheDocument()
  })
})
