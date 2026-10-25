import { describe, expect, it, vi } from 'vitest'
import { apiBaseUrl } from '../api/base-url'
import { readServer, SEED_PASSWORD, type MockServerState } from './server-state'
import { createConsoleHelpers, endMockSessions, expireMockAccess } from './session'

const post = (path: string, body?: unknown) =>
  fetch(`${apiBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const me = (token: string) => fetch(`${apiBaseUrl()}/users/me`, { headers: { Authorization: `Bearer ${token}` } })

async function ownerToken(): Promise<string> {
  const response = await post('/auth/login', { email: 'owner@example.com', password: SEED_PASSWORD })
  return ((await response.json()) as { access_token: string }).access_token
}

describe('помощники моков', () => {
  it('expireAccess: старый access-токен — 401, обмен cookie выдаёт новый', async () => {
    const token = await ownerToken()
    expireMockAccess()
    expect((await me(token)).status).toBe(401)
    const refreshed = await post('/auth/refresh')
    const { access_token: fresh } = (await refreshed.json()) as { access_token: string }
    expect(fresh).not.toBe(token)
    expect((await me(fresh)).status).toBe(200)
  })

  it('endSessions: access недействителен, refresh отозван', async () => {
    const token = await ownerToken()
    endMockSessions()
    expect((await me(token)).status).toBe(401)
    expect((await post('/auth/refresh')).status).toBe(401)
  })

  it('network(false) роняет запросы, network(true) возвращает и сообщает online', async () => {
    const helpers = createConsoleHelpers()
    const onOnline = vi.fn()
    window.addEventListener('online', onOnline)

    helpers.network(false)
    await expect(post('/auth/refresh')).rejects.toThrow()

    helpers.network(true)
    expect(onOnline).toHaveBeenCalledOnce()
    expect((await post('/auth/refresh')).status).toBe(200)
    window.removeEventListener('online', onOnline)
  })

  it('reset возвращает seed', async () => {
    await post('/auth/register', { email: 'new@example.com', password: 'secret123', full_name: 'Новый' })
    createConsoleHelpers().reset()
    expect(readServer().accounts.some((account) => account.email === 'new@example.com')).toBe(false)
  })

  it('сохранённое состояние без новых полей дополняется значениями seed', () => {
    const old: Partial<MockServerState> = { ...readServer() }
    delete old.network
    localStorage.setItem('pawchito:mock-server', JSON.stringify(old))
    expect(readServer().network).toBe(true)
  })
})
