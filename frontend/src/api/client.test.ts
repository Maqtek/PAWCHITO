import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../mocks/node'
import { recordRequests } from '../test/requests'
import { collectEvents, tokenResponse } from '../test/session'
import { getAccessToken, setAccessToken } from './auth-token'
import { api } from './client'
import { NetworkError } from './errors'
import type { User } from './schema'

const user: User = {
  id: 1,
  email: 'owner@example.com',
  role: 'owner',
  full_name: 'Анна Смирнова',
  must_change_password: false,
}

/** Запросы обмена токена; ответ — у обработчика, добавленного раньше. */
const recordRefreshes = () => recordRequests('post', '*/api/auth/refresh')

const meOnlyWith = (accessToken: string) =>
  http.get('*/api/users/me', ({ request }) =>
    request.headers.get('Authorization') === `Bearer ${accessToken}`
      ? HttpResponse.json(user)
      : HttpResponse.json({ detail: 'Требуется вход' }, { status: 401 }),
  )

describe('api', () => {
  it('добавляет access-токен в заголовок', async () => {
    let authorization: string | null = null
    server.use(
      http.get('*/api/users/me', ({ request }) => {
        authorization = request.headers.get('Authorization')
        return HttpResponse.json(user)
      }),
    )
    setAccessToken('t1')

    await api.GET('/users/me')

    expect(authorization).toBe('Bearer t1')
  })

  it('при 401 обновляет токен и повторяет запрос', async () => {
    server.use(http.post('*/api/auth/refresh', () => tokenResponse('fresh')), meOnlyWith('fresh'))
    setAccessToken('stale')

    const { data, response } = await api.GET('/users/me')

    expect(response.status).toBe(200)
    expect(data).toEqual(user)
    expect(getAccessToken()).toBe('fresh')
  })

  it('параллельные запросы с 401 обновляют токен один раз', async () => {
    server.use(http.post('*/api/auth/refresh', () => tokenResponse('fresh')), meOnlyWith('fresh'))
    const refreshes = recordRefreshes()

    const results = await Promise.all([api.GET('/users/me'), api.GET('/users/me')])

    expect(results.map(({ response }) => response.status)).toEqual([200, 200])
    expect(refreshes.count).toBe(1)
  })

  it('если обновить токен не удалось — отдаёт 401 и забывает токен', async () => {
    server.use(
      http.post('*/api/auth/refresh', () => HttpResponse.json({ detail: 'Сессия истекла' }, { status: 401 })),
      meOnlyWith('never'),
    )
    setAccessToken('stale')

    const { response, error } = await api.GET('/users/me')

    expect(response.status).toBe(401)
    expect(error).toEqual({ detail: 'Требуется вход' })
    expect(getAccessToken()).toBeNull()
  })

  it('не обновляет токен в ответ на 401 от самого /auth/refresh', async () => {
    server.use(http.post('*/api/auth/refresh', () => HttpResponse.json({ detail: 'Сессия истекла' }, { status: 401 })))
    const refreshes = recordRefreshes()

    const { response } = await api.POST('/auth/refresh')

    expect(response.status).toBe(401)
    expect(refreshes.count).toBe(1)
  })

  it('при загрузке сначала обновляет токен: первый запрос уходит уже с ним (БП §1)', async () => {
    const authorizations: (string | null)[] = []
    server.use(
      http.post('*/api/auth/refresh', () => tokenResponse('fresh')),
      http.get('*/api/users/me', ({ request }) => {
        authorizations.push(request.headers.get('Authorization'))
        return HttpResponse.json(user)
      }),
    )

    await api.GET('/users/me')

    expect(authorizations).toEqual(['Bearer fresh'])
  })

  it('сервер обновления недоступен — сетевая ошибка, а не выход', async () => {
    server.use(http.post('*/api/auth/refresh', () => HttpResponse.error()), meOnlyWith('never'))
    setAccessToken('stale')

    await expect(api.GET('/users/me')).rejects.toBeInstanceOf(NetworkError)
    expect(getAccessToken()).toBe('stale')
  })

  it('обмен недоступен при загрузке, API отвечает 401 без токена — сетевая ошибка, а не выход', async () => {
    server.use(
      http.post('*/api/auth/refresh', () => HttpResponse.json({ detail: 'Сбой' }, { status: 503 })),
      meOnlyWith('never'),
    )

    await expect(api.GET('/users/me')).rejects.toBeInstanceOf(NetworkError)
  })

  it('refresh без cookie отвечает 422 — гость получает 401, а не сетевую ошибку', async () => {
    server.use(
      http.post('*/api/auth/refresh', () => HttpResponse.json({ detail: [] }, { status: 422 })),
      meOnlyWith('never'),
    )

    const { response } = await api.GET('/users/me')

    expect(response.status).toBe(401)
  })

  it('сессия закончилась на сервере — событие expired', async () => {
    const events = collectEvents()
    server.use(
      http.post('*/api/auth/refresh', () => HttpResponse.json({ detail: 'Сессия истекла' }, { status: 401 })),
      meOnlyWith('never'),
    )
    setAccessToken('stale')

    await api.GET('/users/me')

    expect(events).toEqual([{ type: 'expired' }])
  })

  it('гость: 401 без второго обновления и без события', async () => {
    const events = collectEvents()
    server.use(
      http.post('*/api/auth/refresh', () => HttpResponse.json({ detail: 'Нет сессии' }, { status: 401 })),
      meOnlyWith('never'),
    )
    const refreshes = recordRefreshes()

    const { response } = await api.GET('/users/me')

    expect(response.status).toBe(401)
    expect(refreshes.count).toBe(1)
    expect(events).toEqual([])
  })

  it('403 password_change_required — событие, ответ возвращается как есть', async () => {
    server.use(
      http.get('*/api/notifications/unread-count', () =>
        HttpResponse.json({ detail: 'password_change_required' }, { status: 403 }),
      ),
    )
    const events = collectEvents()
    setAccessToken('t1')

    const { response } = await api.GET('/notifications/unread-count')

    expect(response.status).toBe(403)
    expect(events).toEqual([{ type: 'password-change-required' }])
  })

  it('обычный 403 и 403 на путь сессии — без события', async () => {
    server.use(
      http.get('*/api/notifications/unread-count', () =>
        HttpResponse.json({ detail: 'Аккаунт заблокирован' }, { status: 403 }),
      ),
      http.post('*/api/auth/login', () => HttpResponse.json({ detail: 'password_change_required' }, { status: 403 })),
    )
    const events = collectEvents()
    setAccessToken('t1')

    await api.GET('/notifications/unread-count')
    await api.POST('/auth/login', { body: { email: 'owner@example.com', password: 'pawchito1' } })

    expect(events).toEqual([])
  })

  it('/auth/change-password: middleware не ставит токен и не обменивает его на 401', async () => {
    let authorization: string | null = 'не было запроса'
    server.use(
      http.post('*/api/auth/refresh', () => tokenResponse('fresh')),
      http.post('*/api/auth/change-password', ({ request }) => {
        authorization = request.headers.get('Authorization')
        return HttpResponse.json({ detail: 'Требуется вход' }, { status: 401 })
      }),
    )
    const refreshes = recordRefreshes()
    setAccessToken('t1')

    const { response } = await api.POST('/auth/change-password', {
      body: { current_password: 'pawchito1', new_password: 'newsecret1' },
    })

    expect(response.status).toBe(401)
    expect(authorization).toBeNull()
    expect(refreshes.count).toBe(0)
  })

  it('параллельные 401 с отказом обмена — одно событие expired', async () => {
    const unauthorized = () => HttpResponse.json({ detail: 'Требуется вход' }, { status: 401 })
    server.use(
      http.post('*/api/auth/refresh', unauthorized),
      http.get('*/api/users/me', unauthorized),
      http.get('*/api/pets', unauthorized),
    )
    const events = collectEvents()
    setAccessToken('stale')

    await Promise.all([api.GET('/users/me'), api.GET('/pets')])

    expect(events).toEqual([{ type: 'expired' }])
  })
})
