import { HttpResponse } from 'msw'
import type { Role } from '../api/schema'
import { accountFromAuthorization, type MockAccount, type MockServerState } from './server-state'

export const unauthorized = () => HttpResponse.json({ detail: 'Требуется вход' }, { status: 401 })
export const forbidden = (detail = 'Недостаточно прав') => HttpResponse.json({ detail }, { status: 403 })

export const tooManyRequests = (retryAfterSeconds: number) =>
  HttpResponse.json(
    { detail: 'Слишком много попыток' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  )

interface AccessRules {
  /** Роли, которым доступен эндпоинт; без списка — любая. */
  allowed?: Role[]
  /** Доступен с временным паролем: GET /users/me и смена пароля. */
  allowPasswordChange?: boolean
}

/** Аккаунт из access-токена или готовый ответ 401/403, как у настоящего бэкенда. */
export function authorizeAccount(
  state: MockServerState,
  request: Request,
  { allowed, allowPasswordChange = false }: AccessRules = {},
): MockAccount | Response {
  const account = accountFromAuthorization(state, request.headers.get('Authorization'))
  if (!account) return unauthorized()
  if (!account.is_active) return forbidden('Аккаунт заблокирован')
  if (account.must_change_password && !allowPasswordChange) return forbidden('password_change_required')
  if (allowed && !allowed.includes(account.role)) return forbidden()
  return account
}
