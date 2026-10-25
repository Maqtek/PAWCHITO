import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../mocks/node'
import { api } from './client'
import { ApiError, isNetworkError, NetworkError } from './errors'
import { unwrap } from './queries'

describe('ApiError.fromResponse', () => {
  it('текст из detail и секунды из Retry-After', () => {
    const response = new Response(null, { status: 429, headers: { 'Retry-After': '900' } })
    const error = ApiError.fromResponse(response, { detail: 'Слишком много попыток' })
    expect(error).toMatchObject({ status: 429, detail: 'Слишком много попыток', retryAfter: 900, fieldErrors: {} })
  })

  it('422 в формате FastAPI: ошибки полей по последнему звену loc', () => {
    const response = new Response(null, { status: 422 })
    const error = ApiError.fromResponse(response, {
      detail: [
        { loc: ['body', 'password'], msg: 'Слишком короткий пароль', type: 'value_error' },
        { loc: ['body', 'email'], msg: 'Неверный email', type: 'value_error' },
      ],
    })
    expect(error.fieldErrors).toEqual({ password: 'Слишком короткий пароль', email: 'Неверный email' })
    expect(error.retryAfter).toBeNull()
  })

  it('без detail — текст статуса', () => {
    const response = new Response(null, { status: 502, statusText: 'Bad Gateway' })
    expect(ApiError.fromResponse(response, 'upstream').detail).toBe('Bad Gateway')
  })
})

describe('isNetworkError', () => {
  it.each([
    ['NetworkError', new NetworkError(), true],
    ['TypeError от fetch', new TypeError('Failed to fetch'), true],
    ['ApiError', new ApiError(500, 'Ошибка'), false],
    ['строка', 'строка', false],
  ])('%s → %s', (_, error, expected) => {
    expect(isNetworkError(error)).toBe(expected)
  })
})

describe('unwrap', () => {
  it('ошибка входа превращается в ApiError с Retry-After', async () => {
    server.use(
      http.post('*/api/auth/login', () =>
        HttpResponse.json({ detail: 'Слишком много попыток' }, { status: 429, headers: { 'Retry-After': '600' } }),
      ),
    )
    const request = unwrap(api.POST('/auth/login', { body: { email: 'owner@example.com', password: 'pawchito1' } }))
    await expect(request).rejects.toMatchObject({ name: 'ApiError', status: 429, retryAfter: 600 })
  })

  it('204 без тела — успех', async () => {
    await expect(unwrap(api.POST('/auth/logout'))).resolves.toBeUndefined()
  })
})
