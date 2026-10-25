import { pluralize } from '../lib/format'
import { ApiError, isNetworkError } from './errors'

/** Где случилась ошибка: от этого зависит текст для 400–409. */
export type ErrorContext = 'login' | 'register' | 'recover' | 'change-password' | 'recovery-code' | 'profile' | 'default'

const NETWORK = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'
const SERVER = 'Сервис временно недоступен. Попробуйте через несколько минут.'
const VALIDATION = 'Проверьте поля формы.'
const GENERIC = 'Что-то пошло не так. Попробуйте ещё раз.'

const byContext: Partial<Record<ErrorContext, Partial<Record<number, string>>>> = {
  login: { 401: 'Неверный email или пароль.', 403: 'Аккаунт заблокирован.' },
  register: { 409: 'Этот email уже зарегистрирован.' },
  recover: { 400: 'Неверный email или код.' },
  'change-password': { 400: 'Неверный текущий пароль.' },
  'recovery-code': { 400: 'Неверный текущий пароль.' },
}

/** Текст ошибки запроса для пользователя. Ошибки полей 422 — в ApiError.fieldErrors. */
export function errorMessage(error: unknown, context: ErrorContext = 'default'): string {
  if (isNetworkError(error)) return NETWORK
  if (!(error instanceof ApiError)) return GENERIC
  if (error.status >= 500) return SERVER
  if (error.status === 429) return tooManyAttempts(error.retryAfter)
  if (error.status === 422) return VALIDATION
  return byContext[context]?.[error.status] ?? GENERIC
}

function tooManyAttempts(retryAfter: number | null): string {
  if (retryAfter === null) return 'Слишком много попыток. Попробуйте позже.'
  const minutes = Math.max(1, Math.ceil(retryAfter / 60))
  return `Слишком много попыток. Попробуйте через ${minutes}\u00A0${pluralize(minutes, ['минуту', 'минуты', 'минут'])}.`
}

/** Клиентские проверки форм авторизации (#29, #30). */
export const validationMessages = {
  email: 'Введите email в формате name@example.com',
  passwordLength: 'Пароль — не короче 8 символов',
  passwordMismatch: 'Пароли не совпадают',
  recoveryCode: 'Код в формате XXXX-XXXX-XXXX-XXXX',
} as const

/** Почему пользователь оказался на экране входа. */
export type SessionReason = 'expired' | 'signed-out-elsewhere' | 'logout-pending'

const sessionReasons: Record<SessionReason, string> = {
  expired: 'Сессия истекла — войдите снова',
  'signed-out-elsewhere': 'Вы вышли в другой вкладке',
  'logout-pending': 'Вы вышли на этом устройстве. На сервере сессия завершится, когда появится связь',
}

/** Текст причины из location.state экрана входа или null. */
export function sessionReasonMessage(reason: unknown): string | null {
  return typeof reason === 'string' && Object.hasOwn(sessionReasons, reason)
    ? sessionReasons[reason as SessionReason]
    : null
}
