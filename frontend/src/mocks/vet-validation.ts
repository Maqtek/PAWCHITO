import { vetLimits } from '../api/limits'
import { charCount, hasControlChars } from './auth-validation'
import { textError } from './clinic-validation'

export const vetNameError = (value: unknown) => textError(value, 'ФИО', vetLimits.fullNameMax)

/** Необязательное поле: null и пустая строка — «специализация не указана» (Р-38). */
export function specializationError(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string') return 'Специализация: ожидается строка'
  const text = value.trim()
  if (charCount(text) > vetLimits.specializationMax) {
    return `Специализация — не длиннее ${vetLimits.specializationMax} символов`
  }
  return hasControlChars(text) ? 'Специализация содержит недопустимые символы' : null
}

/** Как StrictBool на бэке: строки «true» и числа 0/1 — не флаг. */
export function vacationError(value: unknown): string | null {
  return typeof value === 'boolean' ? null : 'Отпуск: ожидается true или false'
}

/** Пустая после обрезки специализация хранится как null. */
export function normalizeSpecialization(value: string | null | undefined): string | null {
  const text = value?.trim() ?? ''
  return text === '' ? null : text
}
