import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../mocks/node'
import { renderWithProviders } from '../../test/render'
import { HomePage } from './HomePage'

describe('HomePage', () => {
  it('ошибка загрузки питомцев: сообщение и «Повторить», а не приглашение добавить первого', async () => {
    server.use(http.get('*/api/pets', () => HttpResponse.json({ detail: 'Ошибка' }, { status: 500 })))
    const { user } = renderWithProviders(<HomePage />)

    expect(await screen.findByRole('heading', { name: 'Не удалось загрузить питомцев' })).toBeInTheDocument()
    expect(screen.getByText('Проверьте соединение и попробуйте ещё раз.')).toBeInTheDocument()
    expect(screen.queryByText('Добавьте первого питомца')).not.toBeInTheDocument()

    // Сеть вернулась — «Повторить» загружает питомцев заново.
    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Повторить' }))

    expect(await screen.findByRole('heading', { name: 'Майло' })).toBeInTheDocument()
    expect(screen.queryByText('Не удалось загрузить питомцев')).not.toBeInTheDocument()
  })

  it('питомцев нет — приглашение добавить первого', async () => {
    server.use(http.get('*/api/pets', () => HttpResponse.json([])))
    renderWithProviders(<HomePage />)

    expect(await screen.findByRole('heading', { name: 'Добавьте первого питомца' })).toBeInTheDocument()
    expect(screen.queryByText('Не удалось загрузить питомцев')).not.toBeInTheDocument()
  })

  it('во вкладке «Главная», а не приветствие с полным именем', async () => {
    renderWithProviders(<HomePage />)

    expect(await screen.findByRole('heading', { level: 1, name: /Анна Смирнова/ })).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Главная — PAWCHITO'))
  })
})
