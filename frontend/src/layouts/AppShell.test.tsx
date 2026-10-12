import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { queryKeys } from '../api/queries'
import { server } from '../mocks/node'
import { setMockRole } from '../mocks/session'
import { renderWithProviders } from '../test/render'
import { AppShell } from './AppShell'

function renderShell() {
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<p>Главная страница</p>} />
        <Route path="clinic/appointments" element={<p>Записи клиники</p>} />
        <Route path="pets" element={<p>Страница питомцев</p>} />
        <Route path="profile" element={<p>Страница профиля</p>} />
      </Route>
      <Route path="/login" element={<p>Экран входа</p>} />
    </Routes>,
  )
}

describe('AppShell', () => {
  it('владелец: пять разделов, переключатель питомцев, уведомления', async () => {
    renderShell()
    const nav = await screen.findByRole('navigation', { name: 'Разделы' })
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Главная',
      'Дела',
      'Курс лечения',
      'История',
      'Записи к врачу',
    ])
    expect(within(nav).getByRole('link', { name: 'Главная' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByRole('button', { name: 'Питомец: Майло. Сменить питомца' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Уведомления, непрочитанных: 3' })).toBeInTheDocument()
    expect(screen.getByText(/не ставит диагнозы/)).toBeInTheDocument()
  })

  it('клиника: свои разделы, без переключателя питомцев', async () => {
    setMockRole('clinic')
    renderShell()
    const nav = await screen.findByRole('navigation', { name: 'Разделы' })
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Записи', 'Врачи'])
    expect(screen.queryByRole('button', { name: /Сменить питомца/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/не ставит диагнозы/)).not.toBeInTheDocument()
  })

  it('переключатель меняет и запоминает питомца', async () => {
    const { user } = renderShell()
    await user.click(await screen.findByRole('button', { name: 'Питомец: Майло. Сменить питомца' }))
    await user.click(screen.getByRole('button', { name: 'Кошка Барсик' }))

    expect(screen.getByRole('button', { name: 'Питомец: Барсик. Сменить питомца' })).toBeInTheDocument()
    expect(localStorage.getItem('pawchito:selected-pet-id')).toBe('11')
  })

  it('выход ведёт на экран входа', async () => {
    const { user } = renderShell()
    const [menu] = await screen.findAllByRole('button', { name: 'Меню пользователя' })
    await user.click(menu)
    await user.click(screen.getByRole('button', { name: 'Выйти' }))

    expect(await screen.findByText('Экран входа')).toBeInTheDocument()
  })

  it('ошибка загрузки питомцев: ни переключателя, ни «Добавить питомца»', async () => {
    server.use(http.get('*/api/pets', () => HttpResponse.json({ detail: 'Ошибка' }, { status: 500 })))
    const { queryClient } = renderShell()
    await screen.findByRole('navigation', { name: 'Разделы' })
    await waitFor(() => expect(queryClient.getQueryState(queryKeys.pets)?.status).toBe('error'))

    expect(screen.queryByRole('link', { name: 'Добавить питомца' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Сменить питомца/ })).not.toBeInTheDocument()
  })

  it('выход без сети всё равно ведёт на экран входа', async () => {
    server.use(http.post('*/api/auth/logout', () => HttpResponse.error()))
    const { user } = renderShell()
    const [menu] = await screen.findAllByRole('button', { name: 'Меню пользователя' })
    await user.click(menu)
    await user.click(screen.getByRole('button', { name: 'Выйти' }))

    expect(await screen.findByText('Экран входа')).toBeInTheDocument()
  })
})
