import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../mocks/node'
import { getAccessToken, setAccessToken } from './auth-token'
import { api } from './client'
import type { User } from './schema'

const user: User = {
  id: 1,
  email: 'owner@example.com',
  role: 'owner',
  full_name: 'Анна Смирнова',
  must_change_password: false,
}

const tokenResponse = (accessToken: string) =>
  HttpResponse.json({ access_token: accessToken, token_type: 'bearer', expires_in: 900 })

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
    let refreshCalls = 0
    server.use(
      http.post('*/api/auth/refresh', () => {
        refreshCalls += 1
        return tokenResponse('fresh')
      }),
      meOnlyWith('fresh'),
    )

    const results = await Promise.all([api.GET('/users/me'), api.GET('/users/me')])

    expect(results.map(({ response }) => response.status)).toEqual([200, 200])
    expect(refreshCalls).toBe(1)
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
    let refreshCalls = 0
    server.use(
      http.post('*/api/auth/refresh', () => {
        refreshCalls += 1
        return HttpResponse.json({ detail: 'Сессия истекла' }, { status: 401 })
      }),
    )

    const { response } = await api.POST('/auth/refresh')

    expect(response.status).toBe(401)
    expect(refreshCalls).toBe(1)
  })
})
