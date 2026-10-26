import { describe, expect, it, vi } from 'vitest'
import { call, owner, refresh } from '../test/mock-api'
import { MOCK_SERVER_KEY } from '../test/storage-keys'
import { readServer, type MockServerState } from './server-state'
import { createConsoleHelpers, endMockSessions, expireMockAccess } from './session'

const me = (token: string) => call('GET', '/users/me', { token })

describe('помощники моков', () => {
  it('expireAccess: старый access-токен — 401, обмен cookie выдаёт новый', async () => {
    const token = await owner()
    expireMockAccess()
    expect((await me(token)).status).toBe(401)
    const refreshed = await refresh()
    const { access_token: fresh } = (await refreshed.json()) as { access_token: string }
    expect(fresh).not.toBe(token)
    expect((await me(fresh)).status).toBe(200)
  })

  it('endSessions: access недействителен, refresh отозван', async () => {
    const token = await owner()
    endMockSessions()
    expect((await me(token)).status).toBe(401)
    expect((await refresh()).status).toBe(401)
  })

  it('network(false) роняет запросы, network(true) возвращает и сообщает online', async () => {
    const helpers = createConsoleHelpers()
    const onOnline = vi.fn()
    window.addEventListener('online', onOnline)

    helpers.network(false)
    await expect(refresh()).rejects.toThrow()

    helpers.network(true)
    expect(onOnline).toHaveBeenCalledOnce()
    expect((await refresh()).status).toBe(200)
    window.removeEventListener('online', onOnline)
  })

  it('reset возвращает seed', async () => {
    await call('POST', '/auth/register', { body: { email: 'new@example.com', password: 'secret123', full_name: 'Новый' } })
    createConsoleHelpers().reset()
    expect(readServer().accounts.some((account) => account.email === 'new@example.com')).toBe(false)
  })

  it('сохранённое состояние без новых полей дополняется значениями seed', () => {
    const old: Partial<MockServerState> = { ...readServer() }
    delete old.network
    localStorage.setItem(MOCK_SERVER_KEY, JSON.stringify(old))
    expect(readServer().network).toBe(true)
  })
})

describe('состояние моков до этапа 3', () => {
  it('сохранённое состояние без клиник заменяется seed — у аккаунтов клиник есть clinic_id', () => {
    const old = { ...readServer() } as Record<string, unknown>
    delete old.clinics
    localStorage.setItem(MOCK_SERVER_KEY, JSON.stringify(old))
    const state = readServer()
    expect(state.clinics.map((clinic) => clinic.id)).toEqual([2, 3, 4, 5])
    expect(state.accounts.find((account) => account.email === 'clinic@example.com')?.clinic_id).toBe(2)
  })
})
