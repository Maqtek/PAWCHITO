import { waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '../mocks/node'
import { createGate } from '../test/gate'
import { settle } from '../test/requests'
import { closeOtherTabs, collectEvents, otherTab, tokenBody, tokenResponse } from '../test/session'
import { LOGOUT_PENDING_KEY as PENDING } from '../test/storage-keys'
import { getAccessToken, setAccessToken } from './auth-token'
import { ApiError, NetworkError } from './errors'
import {
  endSession,
  ensureSession,
  finishPendingLogout,
  isRestoreUnavailable,
  reauthenticateWith,
  refreshAccessToken,
  requirePasswordChange,
  signIn,
  signInWith,
  signOut,
} from './session'

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

type LockCallback = () => Promise<unknown>

function installLocks(request: (name: string, callback: LockCallback) => Promise<unknown>) {
  Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true })
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'locks')
  closeOtherTabs()
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

  it.each([
    [400, 'signed-out'],
    [401, 'signed-out'],
    [403, 'signed-out'],
    [404, 'signed-out'],
    [422, 'signed-out'],
    [408, 'unavailable'],
    [429, 'unavailable'],
    [500, 'unavailable'],
    [503, 'unavailable'],
  ] as const)('refresh отвечает %i → %s', async (status, expected) => {
    authServer({ refresh: () => HttpResponse.json({ detail: 'x' }, { status }) })
    await expect(refreshAccessToken()).resolves.toEqual({ status: expected })
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
    await waitFor(() => expect(tab.received).toEqual([{ type: 'signed-in' }]))
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
    await waitFor(() => expect(tab.received).toEqual([{ type: 'signed-out' }]))
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

  it('signOut: очередь отказала после запроса — локальный выход всё равно завершён', async () => {
    installLocks(async (_, callback) => {
      await callback()
      throw new DOMException('lock lost', 'AbortError')
    })
    const tab = otherTab()
    const calls = authServer()
    const events = collectEvents()
    setAccessToken('t1')

    await expect(signOut()).rejects.toThrow('lock lost')

    expect(calls.logout).toBe(1)
    expect(getAccessToken()).toBeNull()
    expect(events).toEqual([expect.objectContaining({ type: 'signed-out' })])
    await waitFor(() => expect(tab.received).toEqual([{ type: 'signed-out' }]))
  })

  it.each([
    [204, true],
    [401, true],
    [403, true],
    [422, true],
    [408, false],
    [429, false],
    [503, false],
  ] as const)('logout отвечает %i → сервер подтвердил: %s', async (status, confirmed) => {
    authServer({
      logout: () => (status === 204 ? new HttpResponse(null, { status }) : HttpResponse.json({ detail: 'x' }, { status })),
    })
    setAccessToken('t1')
    await expect(signOut()).resolves.toEqual({ serverConfirmed: confirmed })
    expect(localStorage.getItem(PENDING)).toBe(confirmed ? null : '1')
  })

  it('finishPendingLogout: параллельные вызовы — один запрос, метка снята', async () => {
    localStorage.setItem(PENDING, '1')
    const calls = authServer()
    await Promise.all([finishPendingLogout(), finishPendingLogout()])
    expect(calls.logout).toBe(1)
    expect(localStorage.getItem(PENDING)).toBeNull()
  })

  it('finishPendingLogout без метки ничего не отправляет', async () => {
    const calls = authServer()
    await expect(finishPendingLogout()).resolves.toBe(true)
    expect(calls.logout).toBe(0)
  })

  it('событие online довыходит на сервере', async () => {
    localStorage.setItem(PENDING, '1')
    const calls = authServer()
    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(calls.logout).toBe(1))
    await waitFor(() => expect(localStorage.getItem(PENDING)).toBeNull())
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
    await waitFor(() => expect(getAccessToken()).toBeNull())
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

  it('несколько endSession подряд — одно событие expired; после нового входа — снова', () => {
    const events = collectEvents()
    setAccessToken('t1')
    endSession()
    endSession()
    endSession()
    expect(events).toEqual([{ type: 'expired' }])

    signIn('t2')
    endSession()
    expect(events).toEqual([{ type: 'expired' }, { type: 'expired' }])
  })

  it('выход в другой вкладке: токен стёрт, signed-out-elsewhere', async () => {
    const tab = otherTab()
    const events = collectEvents()
    setAccessToken('t1')
    tab.channel.postMessage({ type: 'signed-out' })
    await waitFor(() => expect(events).toEqual([{ type: 'signed-out-elsewhere' }]))
    expect(getAccessToken()).toBeNull()
  })

  it('вход в другой вкладке: signed-in-elsewhere, сессия восстанавливается заново', async () => {
    const tab = otherTab()
    const calls = authServer()
    const events = collectEvents()
    await ensureSession()
    expect(calls.refresh).toBe(1)
    tab.channel.postMessage({ type: 'signed-in' })
    await waitFor(() => expect(events).toEqual([{ type: 'signed-in-elsewhere' }]))
    expect(getAccessToken()).toBeNull()
    await ensureSession()
    expect(calls.refresh).toBe(2)
  })
})

describe('requirePasswordChange', () => {
  it('сообщает событием password-change-required', () => {
    const events = collectEvents()
    requirePasswordChange()
    expect(events).toEqual([{ type: 'password-change-required' }])
  })
})

describe('signInWith', () => {
  const login = (token = 'new') => async () => tokenBody(token)

  it('ждёт обмен этой вкладки и входит внутри очереди', async () => {
    const names: string[] = []
    installLocks((name, callback) => {
      names.push(name)
      return callback()
    })
    const gate = createGate()
    const order: string[] = []
    authServer({
      refresh: async () => {
        await gate.opened
        order.push('refresh')
        return tokenResponse('fresh')
      },
    })
    setAccessToken('t0')
    const refreshing = refreshAccessToken()
    const signing = signInWith(async () => {
      order.push('login')
      return login()()
    })
    gate.release()
    await refreshing
    await signing
    expect(order).toEqual(['refresh', 'login'])
    expect(names).toEqual(['pawchito:refresh', 'pawchito:refresh'])
    expect(getAccessToken()).toBe('new')
  })

  it('сначала доводит выход, начатый без сети, потом входит', async () => {
    localStorage.setItem(PENDING, '1')
    const order: string[] = []
    authServer({
      logout: () => {
        order.push('logout')
        return new HttpResponse(null, { status: 204 })
      },
    })
    await signInWith(async () => {
      order.push('login')
      return login()()
    })
    expect(order).toEqual(['logout', 'login'])
    expect(localStorage.getItem(PENDING)).toBeNull()
    expect(getAccessToken()).toBe('new')
  })

  it('возвращает весь ответ и сообщает вкладкам о входе', async () => {
    const tab = otherTab()
    const result = await signInWith(async () => ({ ...(await login()()), recovery_code: 'AAAA-BBBB-CCCC-DDDD' }))
    expect(result.recovery_code).toBe('AAAA-BBBB-CCCC-DDDD')
    await waitFor(() => expect(tab.received).toEqual([{ type: 'signed-in' }]))
  })

  it('упавший запрос: токен не меняется, вкладкам ничего не уходит', async () => {
    const tab = otherTab()
    setAccessToken('t0')
    await expect(signInWith(() => Promise.reject(new Error('401')))).rejects.toThrow('401')
    expect(getAccessToken()).toBe('t0')
    await settle()
    expect(tab.received).toEqual([])
  })

  it('отказ navigator.locks.request: запрос выполняется один раз без очереди', async () => {
    installLocks(() => Promise.reject(new DOMException('denied', 'SecurityError')))
    let calls = 0
    await signInWith(async () => {
      calls += 1
      return login()()
    })
    expect(calls).toBe(1)
    expect(getAccessToken()).toBe('new')
  })

  it('ошибка самого запроса внутри очереди не повторяется', async () => {
    installLocks((_, callback) => callback())
    let calls = 0
    await expect(
      signInWith(async () => {
        calls += 1
        throw new Error('401')
      }),
    ).rejects.toThrow('401')
    expect(calls).toBe(1)
  })

  it('передаёт запросу сигнал таймаута', async () => {
    const signals: AbortSignal[] = []
    await signInWith(async (signal) => {
      signals.push(signal)
      return login()()
    })
    expect(signals).toHaveLength(1)
    expect(signals[0]).toBeInstanceOf(AbortSignal)
    expect(signals[0].aborted).toBe(false)
  })
})

describe('reauthenticateWith', () => {
  const unauthorized = () => new ApiError(401, 'Требуется вход')

  /** Очередь как у Web Locks: задачи по одной, вложенный запрос того же имени ждал бы вечно. */
  function installQueue() {
    const names: string[] = []
    let tail: Promise<unknown> = Promise.resolve()
    installLocks((name, callback) => {
      names.push(name)
      const run = tail.then(callback)
      tail = run.then(
        () => undefined,
        () => undefined,
      )
      return run
    })
    return names
  }

  it('запрос в очереди с текущим токеном и сигналом; новый токен ставится, другим вкладкам ничего', async () => {
    const names = installQueue()
    const tab = otherTab()
    setAccessToken('t0')
    const seen: { token: string; signal: AbortSignal }[] = []
    const result = await reauthenticateWith(async (token, signal) => {
      seen.push({ token, signal })
      return tokenBody('t1')
    })
    expect(result.access_token).toBe('t1')
    expect(seen.map((item) => item.token)).toEqual(['t0'])
    expect(seen[0].signal).toBeInstanceOf(AbortSignal)
    expect(names).toEqual(['pawchito:refresh'])
    expect(getAccessToken()).toBe('t1')
    await settle(20)
    expect(tab.received).toEqual([])
  })

  it('на 401 обменивает cookie под той же блокировкой и повторяет один раз', async () => {
    const names = installQueue()
    authServer({ refresh: () => tokenResponse('fresh') })
    setAccessToken('stale')
    const tokens: string[] = []
    const result = await reauthenticateWith(async (token) => {
      tokens.push(token)
      if (token === 'stale') throw unauthorized()
      return tokenBody('changed')
    })
    expect(tokens).toEqual(['stale', 'fresh'])
    expect(names).toEqual(['pawchito:refresh'])
    expect(result.access_token).toBe('changed')
    expect(getAccessToken()).toBe('changed')
  })

  it('обмен отказал — событие expired и ошибка 401', async () => {
    authServer({ refresh: () => HttpResponse.json({ detail: 'Требуется вход' }, { status: 401 }) })
    const events = collectEvents()
    setAccessToken('stale')
    await expect(
      reauthenticateWith(async () => {
        throw unauthorized()
      }),
    ).rejects.toMatchObject({ status: 401 })
    expect(events).toEqual([{ type: 'expired' }])
    expect(getAccessToken()).toBeNull()
  })

  it('обмен недоступен — NetworkError, сессия не завершается', async () => {
    authServer({ refresh: () => HttpResponse.json({ detail: 'Ошибка' }, { status: 503 }) })
    const events = collectEvents()
    setAccessToken('stale')
    await expect(
      reauthenticateWith(async () => {
        throw unauthorized()
      }),
    ).rejects.toBeInstanceOf(NetworkError)
    expect(events).toEqual([])
    expect(getAccessToken()).toBe('stale')
  })

  it('обмен этой вкладки, начатый раньше, не теряет токен: его ждём до очереди', async () => {
    installQueue()
    const gate = createGate()
    authServer({
      refresh: async () => {
        await gate.opened
        return tokenResponse('fresh')
      },
    })
    setAccessToken('stale')
    const refreshing = refreshAccessToken()
    const tokens: string[] = []

    const changing = reauthenticateWith(async (token) => {
      tokens.push(token)
      return tokenBody('changed')
    })
    gate.release()

    await expect(refreshing).resolves.toEqual({ status: 'ok', token: 'fresh' })
    await changing
    expect(tokens).toEqual(['fresh'])
  })

  it('другая ошибка запроса пробрасывается без обмена, токен прежний', async () => {
    const calls = authServer()
    setAccessToken('t0')
    await expect(
      reauthenticateWith(async () => {
        throw new ApiError(400, 'Неверный текущий пароль')
      }),
    ).rejects.toMatchObject({ status: 400 })
    expect(calls.refresh).toBe(0)
    expect(getAccessToken()).toBe('t0')
  })
})

describe('доработки после #28', () => {
  it('довыход при запуске идёт внутри очереди', async () => {
    const names: string[] = []
    installLocks((name, callback) => {
      names.push(name)
      return callback()
    })
    localStorage.setItem(PENDING, '1')
    authServer()
    await finishPendingLogout()
    expect(names).toEqual(['pawchito:refresh'])
  })

  it('довыход в очереди перепроверяет метку: пока ждали, выход уже довели — запроса нет', async () => {
    const gate = createGate()
    installLocks(async (_, callback) => {
      await gate.opened
      return callback()
    })
    localStorage.setItem(PENDING, '1')
    const calls = authServer()
    const finishing = finishPendingLogout()
    localStorage.removeItem(PENDING)
    gate.release()
    await expect(finishing).resolves.toBe(true)
    expect(calls.logout).toBe(0)
  })

  it('сообщение другой вкладки неизвестного типа игнорируется', async () => {
    const tab = otherTab()
    const events = collectEvents()
    setAccessToken('t1')
    // Канал доставляет по порядку: когда дошёл signed-out, неизвестное сообщение уже обработано.
    tab.channel.postMessage({ type: 'reauthenticated' })
    tab.channel.postMessage({ type: 'signed-out' })
    await waitFor(() => expect(events).toContainEqual({ type: 'signed-out-elsewhere' }))
    expect(events).toEqual([{ type: 'signed-out-elsewhere' }])
  })
})
