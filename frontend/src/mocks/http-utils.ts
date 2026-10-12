import { HttpResponse } from 'msw'
import type { Role } from '../api/schema'
import { roleFromRequest } from './session'

export const unauthorized = () => HttpResponse.json({ detail: 'Требуется вход' }, { status: 401 })
export const forbidden = () => HttpResponse.json({ detail: 'Недостаточно прав' }, { status: 403 })

/** Роль из access-токена или готовый ответ 401/403, как у настоящего бэкенда. */
export function authorize(request: Request, allowed: Role[]): Role | Response {
  const role = roleFromRequest(request)
  if (!role) return unauthorized()
  return allowed.includes(role) ? role : forbidden()
}
