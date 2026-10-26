import { HttpResponse } from 'msw'
import type { Role } from '../api/schema'
import { isoDateError } from './date-validation'
import { accountFromAuthorization, type MockAccount, type MockServerState } from './server-state'

export const unauthorized = () => HttpResponse.json({ detail: 'Требуется вход' }, { status: 401 })
export const forbidden = (detail = 'Недостаточно прав') => HttpResponse.json({ detail }, { status: 403 })
export const notFound = (detail: string) => HttpResponse.json({ detail }, { status: 404 })
export const conflict = (detail: string) => HttpResponse.json({ detail }, { status: 409 })

export const tooManyRequests = (retryAfterSeconds: number) =>
  HttpResponse.json(
    { detail: 'Слишком много попыток' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  )

/** Ошибка поля в формате FastAPI: loc — место ("body" или "query") и путь к полю. */
export interface FieldError {
  loc: (string | number)[]
  msg: string
  type: string
}

/** 422 со списком ошибок полей, как у FastAPI. */
export const unprocessable = (detail: FieldError[]) => HttpResponse.json({ detail }, { status: 422 })

/** type — value_error, как у проверок Pydantic; другой — только у ошибок разбора параметра (missing, int_parsing). */
export const fieldError = (loc: FieldError['loc'], msg: string, type = 'value_error'): FieldError => ({ loc, msg, type })

/** Ответ 422 со всеми ошибками полей сразу или null, если ошибок нет. */
export function fieldErrors(where: 'body' | 'query', checks: Record<string, string | null>): Response | null {
  const detail = Object.entries(checks)
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([field, msg]) => fieldError([where, field], msg))
  return detail.length > 0 ? unprocessable(detail) : null
}

/** Ошибки полей тела запроса или null. */
export const validateBody = (checks: Record<string, string | null>) => fieldErrors('body', checks)

/** 422 одного параметра запроса. */
export const queryError = (field: string, msg: string, type?: string) =>
  unprocessable([fieldError(['query', field], msg, type)])

/** Фильтр status из параметров: null — без фильтра, неизвестный статус — 422 со списком допустимых. */
export function readStatus<T extends string>(query: URLSearchParams, allowed: readonly T[]): T | null | Response {
  const status = query.get('status')
  if (status === null || allowed.includes(status as T)) return status as T | null
  return queryError('status', `Статус: ${allowed.slice(0, -1).join(', ')} или ${allowed[allowed.length - 1]}`)
}

/** Фильтр date_from / date_to из параметров: даты ГГГГ-ММ-ДД, ошибка первой неверной — 422. */
export function readDateRange(query: URLSearchParams): { from: string | null; to: string | null } | Response {
  const from = query.get('date_from')
  const to = query.get('date_to')
  for (const [field, value] of [['date_from', from], ['date_to', to]] as const) {
    const error = value === null ? null : isoDateError(value, 'Дата')
    if (error) return queryError(field, error)
  }
  return { from, to }
}

/** Тело запроса как объект; не JSON или не объект — пустой объект, и поля получат ошибки. */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json()
    return isObject(body) ? body : {}
  } catch {
    return {}
  }
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

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
