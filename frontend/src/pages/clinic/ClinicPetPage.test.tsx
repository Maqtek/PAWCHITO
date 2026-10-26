import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../app/routes'
import { loginMockAs, resetMockServer } from '../../mocks/session'
import { renderWithProviders } from '../../test/render'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-28T06:00:00Z'))
  resetMockServer()
  loginMockAs('clinic')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ClinicPetPage', () => {
  it('карточка: данные, особенности, прививки, дневник и приёмы в этой клинике — только чтение', async () => {
    renderWithProviders(<AppRoutes />, { route: '/clinic/pets/10' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Майло' })).toBeInTheDocument()
    expect(screen.getByText('Аллергия на курицу')).toBeInTheDocument()
    expect(screen.getByText('Дисплазия тазобедренных суставов')).toBeInTheDocument()
    expect(screen.queryByText('Аллергия на блох')).not.toBeInTheDocument()
    expect(screen.getByText('Нобивак DHPPi')).toBeInTheDocument()
    expect(await screen.findByText(/Хромает на заднюю лапу после прогулки/)).toBeInTheDocument()
    const visits = screen.getByRole('heading', { name: 'Приёмы в вашей клинике' }).closest('div')!
    expect(within(visits).getByText('Итог: Растяжение связок задней лапы')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Изменить/ })).not.toBeInTheDocument()
  })

  it('без неотменённой записи в клинику — карточка недоступна', async () => {
    renderWithProviders(<AppRoutes />, { route: '/clinic/pets/12' })
    expect(await screen.findByText('Карточка недоступна')).toBeInTheDocument()
  })
})
