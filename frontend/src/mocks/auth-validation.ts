import { authLimits } from '../api/limits'
import { charCount, textError } from './text-validation'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RECOVERY_CODE = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/

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

export const fullNameError = (value: unknown) => textError(value, 'Имя', authLimits.fullNameMax)

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
