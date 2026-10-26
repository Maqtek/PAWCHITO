import { HttpResponse } from 'msw'
import { authLimits } from '../api/limits'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RECOVERY_CODE = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/

/** Длина в символах Unicode, как len() в Python. */
export const charCount = (value: string) => [...value].length

/** Управляющие символы U+0000–U+001F и U+007F. */
export function hasControlChars(value: string): boolean {
  return [...value].some((char) => {
    const code = char.codePointAt(0) ?? 0
    return code < 0x20 || code === 0x7f
  })
}

/** Тело запроса как объект; не JSON или не объект — пустой объект, и поля получат ошибки. */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json()
    return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Ответ 422 в формате FastAPI со всеми ошибками полей сразу или null, если ошибок нет. */
export function validateBody(checks: Record<string, string | null>): Response | null {
  const detail = Object.entries(checks)
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([field, msg]) => ({ loc: ['body', field], msg, type: 'value_error' }))
  return detail.length > 0 ? HttpResponse.json({ detail }, { status: 422 }) : null
}

/** Строка не длиннее max — для полей, которые дальше сверяет сам сервер (вход, текущий пароль). */
export function maxLengthError(value: unknown, max: number, label: string): string | null {
  if (typeof value !== 'string') return `${label}: ожидается строка`
  return charCount(value) > max ? `${label} — не длиннее ${max} символов` : null
}

export function emailError(value: unknown): string | null {
  const tooLong = maxLengthError(value, authLimits.emailMax, 'Email')
  if (tooLong) return tooLong
  return EMAIL.test((value as string).trim()) ? null : 'Неверный формат email'
}

/** Пароль не обрезается: пробелы по краям — его часть. */
export function passwordError(value: unknown): string | null {
  const tooLong = maxLengthError(value, authLimits.passwordMax, 'Пароль')
  if (tooLong) return tooLong
  return charCount(value as string) < authLimits.passwordMin
    ? `Пароль должен быть не короче ${authLimits.passwordMin} символов`
    : null
}

/** Имя хранится как текст: HTML не чистим, экранирует фронт. */
export function fullNameError(value: unknown): string | null {
  if (typeof value !== 'string') return 'Имя: ожидается строка'
  const name = value.trim()
  if (name === '') return 'Имя не может быть пустым'
  if (charCount(name) > authLimits.fullNameMax) return `Имя — не длиннее ${authLimits.fullNameMax} символов`
  return hasControlChars(name) ? 'Имя содержит недопустимые символы' : null
}

/**
 * Как у бэкенда: регистр и разделители (пробелы, дефисы) не важны — остаются буквы и цифры.
 * Ровно 16 символов приводятся к XXXX-XXXX-XXXX-XXXX, иначе строка остаётся очищенной и не пройдёт формат (422).
 */
export function normalizeRecoveryCode(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return cleaned.length === 16 ? cleaned.replace(/(.{4})(?=.)/g, '$1-') : cleaned
}

export function recoveryCodeError(value: unknown): string | null {
  if (typeof value !== 'string') return 'Код: ожидается строка'
  return RECOVERY_CODE.test(normalizeRecoveryCode(value)) ? null : 'Код в формате XXXX-XXXX-XXXX-XXXX'
}
