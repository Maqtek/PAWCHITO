import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { server } from '../mocks/node'
import { getAccessToken, setAccessToken } from './auth-token'
import {
  endSession,
  ensureSession,
  isRestoreUnavailable,
  onSessionChange,
  refreshAccessToken,
  signIn,
  signOut,
  type SessionEvent,
} from './session'

const PENDING = 'pawchito:logout-pending'

const tokenResponse = (token: string) =>
  HttpResponse.json({ access_token: token, token_type: 'bearer', expires_in: 900 })

/** Отвечает на /auth/refresh и /auth/logout и считает обращения. */
function authServer({
  refresh = () => tokenResponse('fresh'),
  logout = () => new HttpResponse(null, { status: 204 }),
}: { refresh?: () => Response | Promise<Response>; logout?: () => Response | Promise<Response> } = {}) {
  const calls = { refresh: 0, logout: 0 }
  server.use(
    http.post('*/api/auth/refresh', () => {
      calls.refresh += 1
      return refresh()
    }),
    http.post('*/api/auth/logout', () => {
      calls.logout += 1
      return logout()
    }),
  )
  return calls
}

/** Ворота: ответ сервера держится, пока тест не вызовет release. */
function createGate() {
  let release!: () => void
  const opened = new Promise<void>((resolve) => {
    release = resolve
  })
  return { opened, release }
}

function collectEvents() {
  const events: SessionEvent[] = []
  onSessionChange((event) => events.push(event))
  return events
}

const openTabs: BroadcastChannel[] = []

/** Вторая «вкладка»: свой канал с тем же именем. */
function otherTab() {
  const channel = new BroadcastChannel('pawchito:session')
  const received: unknown[] = []
  channel.onmessage = (event: MessageEvent) => received.push(event.data)
  openTabs.push(channel)
  return { channel, received }
}

type LockCallback = () => Promise<unknown>

function installLocks(request: (name: string, callback: LockCallback) => Promise<unknown>) {
  Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true })
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'locks')
  openTabs.splice(0).forEach((channel) => channel.close())
})

describe('ensureSession', () => {
  it('параллельные вызовы ждут одно восстановление по refresh-cookie', async () => {
    const calls = authServer()
    await Promise.all([ensureSession(), ensureSession(), ensureSession()])
    expect(calls.refresh).toBe(1)
    expect(getAccessToken()).toBe('fresh')
  })

  it('с токеном ничего не восстанавливает', async () => {
    const calls = authServer()
    setAccessToken('t1')
    await ensureSession()
    expect(calls.refresh).toBe(0)
  })

  it('гость: после неудачного восстановления повторно не пробует', async () => {
    const calls = authServer({ refresh: () => HttpResponse.json({ detail: 'Нет сессии' }, { status: 401 }) })
    await ensureSession()
    await ensureSession()
    expect(calls.refresh).toBe(1)
    expect(getAccessToken()).toBeNull()
  })

  it('сеть недоступна при восстановлении — следующий вызов пробует снова', async () => {
    let online = false
    const calls = authServer({ refresh: () => (online ? tokenResponse('fresh') : HttpResponse.error()) })
    await ensureSession()
    expect(getAccessToken()).toBeNull()

    online = true
    await ensureSession()

    expect(calls.refresh).toBe(2)
    expect(getAccessToken()).toBe('fresh')
  })

  it('метка выхода после сбоя восстановления: вкладка снова просто гость', async () => {
    authServer({ refresh: () => HttpResponse.json({ detail: 'Сбой' }, { status: 503 }) })
    await ensureSession()
    expect(isRestoreUnavailable()).toBe(true)

    localStorage.setItem(PENDING, '1')
    await ensureSession()

    expect(isRestoreUnavailable()).toBe(false)
  })

  it('метка выхода: довыходит на сервере, сессию по cookie не восстанавливает', async () => {
    localStorage.setItem(PENDING, '1')
    const calls = authServer()
    await ensureSession()
    expect(calls).toEqual({ refresh: 0, logout: 1 })
    expect(getAccessToken()).toBeNull()
    expect(localStorage.getItem(PENDING)).toBeNull()
  })
})

describe('refreshAccessToken', () => {
  it('200 — новый токен', async () => {
    authServer()
    await expect(refreshAccessToken()).resolves.toEqual({ status: 'ok', token: 'fresh' })
    expect(getAccessToken()).toBe('fresh')
  })

  it('401 — сессии нет, токен стёрт', async () => {
    authServer({ refresh: () => HttpResponse.json({ detail: 'Сессия истекла' }, { status: 401 }) })
    setAccessToken('stale')
    await expect(refreshAccessToken()).resolves.toEqual({ status: 'signed-out' })
    expect(getAccessToken()).toBeNull()
  })

  it.each([
    ['5xx', () => HttpResponse.json({ detail: 'Ошибка' }, { status: 503 })],
    ['обрыв сети', () => HttpResponse.error()],
  ])('%s — сервер недоступен, токен не трогаем', async (_, refresh) => {
    authServer({ refresh })
    setAccessToken('stale')
    await expect(refreshAccessToken()).resolves.toEqual({ status: 'unavailable' })
    expect(getAccessToken()).toBe('stale')
  })

  it('при метке выхода не ходит на сервер', async () => {
    localStorage.setItem(PENDING, '1')
    const calls = authServer()
    await expect(refreshAccessToken()).resolves.toEqual({ status: 'signed-out' })
    expect(calls.refresh).toBe(0)
  })

  it('обмен идёт внутри navigator.locks', async () => {
    const names: string[] = []
    installLocks((name, callback) => {
      names.push(name)
      return callback()
    })
    authServer()
    await expect(refreshAccessToken()).resolves.toEqual({ status: 'ok', token: 'fresh' })
    expect(names).toEqual(['pawchito:refresh'])
  })

  it('пока ждали очереди, другая вкладка вышла — обмена нет', async () => {
    installLocks((_, callback) => {
      localStorage.setItem(PENDING, '1')
      return callback()
    })
    const calls = authServer()
    await expect(refreshAccessToken()).resolves.toEqual({ status: 'signed-out' })
    expect(calls.refresh).toBe(0)
  })
})

describe('вход и выход', () => {
  it('signIn: токен, метка снята, другие вкладки узнают о входе', async () => {
    localStorage.setItem(PENDING, '1')
    const tab = otherTab()
    const calls = authServer()
    signIn('t1')
    expect(getAccessToken()).toBe('t1')
    expect(localStorage.getItem(PENDING)).toBeNull()
    await vi.waitFor(() => expect(tab.received).toEqual([{ type: 'signed-in' }]))
    await ensureSession()
    expect(calls.refresh).toBe(0)
  })

  it('signOut с сетью: сервер подтвердил, метки нет, событие и сообщение вкладкам', async () => {
    const tab = otherTab()
    const calls = authServer()
    const events = collectEvents()
    setAccessToken('t1')
    await expect(signOut()).resolves.toEqual({ serverConfirmed: true })
    expect(calls.logout).toBe(1)
    expect(getAccessToken()).toBeNull()
    expect(localStorage.getItem(PENDING)).toBeNull()
    expect(events).toEqual([{ type: 'signed-out', serverConfirmed: true }])
    await vi.waitFor(() => expect(tab.received).toEqual([{ type: 'signed-out' }]))
  })

  it('signOut без сети: метка остаётся и блокирует восстановление сессии', async () => {
    const calls = authServer({ logout: () => HttpResponse.error() })
    const events = collectEvents()
    setAccessToken('t1')
    await expect(signOut()).resolves.toEqual({ serverConfirmed: false })
    expect(localStorage.getItem(PENDING)).toBe('1')
    expect(events).toEqual([{ type: 'signed-out', serverConfirmed: false }])
    await expect(refreshAccessToken()).resolves.toEqual({ status: 'signed-out' })
    expect(calls.refresh).toBe(0)
  })

  it('событие online довыходит на сервере', async () => {
    localStorage.setItem(PENDING, '1')
    const calls = authServer()
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(calls.logout).toBe(1))
    await vi.waitFor(() => expect(localStorage.getItem(PENDING)).toBeNull())
  })
})

describe('обмен и выход одновременно', () => {
  it('выход во время обмена: поздний ответ refresh токен не возвращает', async () => {
    const order: string[] = []
    const gate = createGate()
    authServer({
      refresh: async () => {
        order.push('refresh:start')
        await gate.opened
        order.push('refresh:end')
        return tokenResponse('late')
      },
      logout: () => {
        order.push('logout')
        return new HttpResponse(null, { status: 204 })
      },
    })
    setAccessToken('t1')

    const refreshing = refreshAccessToken()
    const signingOut = signOut()
    gate.release()

    await expect(refreshing).resolves.toEqual({ status: 'unavailable' })
    await signingOut
    expect(getAccessToken()).toBeNull()
    expect(order).toEqual(['refresh:start', 'refresh:end', 'logout'])
  })

  it('выход в другой вкладке во время обмена: поздний ответ токен не возвращает', async () => {
    const gate = createGate()
    authServer({
      refresh: async () => {
        await gate.opened
        return tokenResponse('late')
      },
    })
    setAccessToken('t1')

    const refreshing = refreshAccessToken()
    otherTab().channel.postMessage({ type: 'signed-out' })
    await vi.waitFor(() => expect(getAccessToken()).toBeNull())
    gate.release()

    await expect(refreshing).resolves.toEqual({ status: 'unavailable' })
    expect(getAccessToken()).toBeNull()
  })
})

describe('события сессии', () => {
  it('endSession: токен стёрт, событие expired', () => {
    const events = collectEvents()
    setAccessToken('t1')
    endSession()
    expect(getAccessToken()).toBeNull()
    expect(events).toEqual([{ type: 'expired' }])
  })

  it('выход в другой вкладке: токен стёрт, signed-out-elsewhere', async () => {
    const tab = otherTab()
    const events = collectEvents()
    setAccessToken('t1')
    tab.channel.postMessage({ type: 'signed-out' })
    await vi.waitFor(() => expect(events).toEqual([{ type: 'signed-out-elsewhere' }]))
    expect(getAccessToken()).toBeNull()
  })

  it('вход в другой вкладке: signed-in-elsewhere, сессия восстанавливается заново', async () => {
    const tab = otherTab()
    const calls = authServer()
    const events = collectEvents()
    await ensureSession()
    expect(calls.refresh).toBe(1)
    tab.channel.postMessage({ type: 'signed-in' })
    await vi.waitFor(() => expect(events).toEqual([{ type: 'signed-in-elsewhere' }]))
    expect(getAccessToken()).toBeNull()
    await ensureSession()
    expect(calls.refresh).toBe(2)
  })
})
