import { describe, expect, it } from 'vitest'
import { setMockNetwork } from '../session'
import { isMockOffline } from './network'

describe('выключатель сети моков', () => {
  it('сеть выключена — запросы к API падают, модули Vite с /api/ в пути — нет', () => {
    setMockNetwork(false)
    expect(isMockOffline(new Request('http://localhost:5173/api/users/me'))).toBe(true)
    expect(isMockOffline(new Request('http://localhost:5173/src/api/client.ts'))).toBe(false)
  })

  it('сеть включена — ничего не падает', () => {
    expect(isMockOffline(new Request('http://localhost:5173/api/users/me'))).toBe(false)
  })
})
