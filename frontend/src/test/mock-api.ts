import { apiBaseUrl } from '../api/base-url'
import { SEED_PASSWORD } from '../mocks/server-state'

interface CallOptions {
  /** Тело запроса — уходит JSON. */
  body?: unknown
  /** Тело как есть, без JSON.stringify: для запросов «не JSON». */
  raw?: string
  token?: string
}

/** Запрос к мокам напрямую, без клиента и сессии приложения. */
export function call(method: string, path: string, { body, raw, token }: CallOptions = {}) {
  return fetch(`${apiBaseUrl()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  })
}

export const login = (email: string, password = SEED_PASSWORD) => call('POST', '/auth/login', { body: { email, password } })
export const refresh = () => call('POST', '/auth/refresh')

/** Вход аккаунтом моков — access-токен из ответа. «Браузер» получает cookie этого аккаунта, как после входа. */
export async function accessToken(email = 'owner@example.com', password = SEED_PASSWORD): Promise<string> {
  const response = await login(email, password)
  return ((await response.json()) as { access_token: string }).access_token
}

export const owner = () => accessToken('owner@example.com')
export const clinic = () => accessToken('clinic@example.com')
export const admin = () => accessToken('admin@example.com')

type ValidationErrors = { detail: { loc: (string | number)[] }[] }

/** Места ошибок 422 через точку, по алфавиту: «body.name», «query.date», «body.prescriptions.0.times». */
export async function locs(response: Response): Promise<string[]> {
  return ((await response.json()) as ValidationErrors).detail.map((item) => item.loc.join('.')).sort()
}

/** Поля тела с ошибками 422 (второй элемент loc), по алфавиту. */
export async function bodyFields(response: Response): Promise<string[]> {
  return ((await response.json()) as ValidationErrors).detail.map((item) => String(item.loc[1])).sort()
}
