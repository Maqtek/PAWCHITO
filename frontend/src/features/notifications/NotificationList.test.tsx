import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../app/routes'
import { readServer } from '../../mocks/server-state'
import { loginMockAs, resetMockServer } from '../../mocks/session'
import { renderWithProviders } from '../../test/render'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-28T06:00:00Z'))
  resetMockServer()
  loginMockAs('owner')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('уведомления в шапке', () => {
  it('список от новых к старым; переход отмечает прочитанным и ведёт по ссылке', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: '/' })
    await user.click(await screen.findByRole('button', { name: 'Уведомления, непрочитанных: 3' }))
    const items = await screen.findAllByRole('button', { name: /^(Новое:\s*)?(Внесён|Клиника)/ })
    expect(items).toHaveLength(5)
    expect(items[0]).toHaveAccessibleName(/^Новое:\s*Внесён итог приёма: Майло — на лечении/)
    // Прочитанные — без пометки «Новое».
    expect(items.filter((item) => item.textContent?.startsWith('Новое'))).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: /^Новое:\s*Клиника «ВетДоктор» подтвердила запись/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Запись к врачу' })).toBeInTheDocument()
    expect(await screen.findByText('Плановая от бешенства', { exact: false })).toBeInTheDocument()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Уведомления, непрочитанных: 2' })).toBeInTheDocument())
    expect(readServer().notifications.find((item) => item.id === 3)?.read_at).not.toBeNull()
  })

  it('«Прочитать все» обнуляет счётчик', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: '/' })
    await user.click(await screen.findByRole('button', { name: 'Уведомления, непрочитанных: 3' }))
    await user.click(await screen.findByRole('button', { name: 'Прочитать все' }))
    expect(await screen.findByRole('button', { name: 'Уведомления' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Прочитать все' })).not.toBeInTheDocument()
  })

  it('клиника: ссылка ведёт на день приёма в записях', async () => {
    loginMockAs('clinic')
    const { user } = renderWithProviders(<AppRoutes />, { route: '/clinic/vets' })
    await user.click(await screen.findByRole('button', { name: 'Уведомления, непрочитанных: 2' }))
    await user.click(await screen.findByRole('button', { name: /^Новое:\s*Новая заявка: Барсик/ }))
    const article = await screen.findByRole('article', { name: 'четверг, 29 октября, 09:00' })
    expect(within(article).getByText('Заявка')).toBeInTheDocument()
    expect(screen.getByLabelText('С')).toHaveValue('2026-10-29')
  })
})
