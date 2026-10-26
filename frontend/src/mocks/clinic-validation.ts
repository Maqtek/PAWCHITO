import { clinicLimits } from '../api/limits'
import { charCount, hasControlChars } from './auth-validation'

const TIME = /^([01]\d|2[0-3]):(00|30)$/
const PHONE = /^\+7\d{10}$/

/** Обязательная строка: пробелы по краям не считаются, без управляющих символов. */
export function textError(value: unknown, label: string, max: number): string | null {
  if (typeof value !== 'string') return `${label}: ожидается строка`
  const text = value.trim()
  if (text === '') return `${label} не может быть пустым`
  if (charCount(text) > max) return `${label} — не длиннее ${max} символов`
  return hasControlChars(text) ? `${label} содержит недопустимые символы` : null
}

export const clinicNameError = (value: unknown) => textError(value, 'Название', clinicLimits.nameMax)
export const clinicAddressError = (value: unknown) => textError(value, 'Адрес', clinicLimits.addressMax)

export function phoneError(value: unknown): string | null {
  if (typeof value !== 'string') return 'Телефон: ожидается строка'
  return PHONE.test(value) ? null : 'Телефон: +7 и 10 цифр'
}

/** Часы с шагом 30 минут — по сетке слотов. */
export function timeError(value: unknown, label: string): string | null {
  if (typeof value !== 'string') return `${label}: ожидается строка`
  return TIME.test(value) ? null : `${label}: время ЧЧ:ММ с шагом 30 минут`
}

/** ЧЧ:ММ одинаковой длины сравниваются как строки. */
export function closesError(opens: unknown, closes: unknown): string | null {
  return typeof opens === 'string' && typeof closes === 'string' && opens >= closes ? 'Закрытие — позже открытия' : null
}

/** Как StrictInt на бэке: строки и true/false — не дни. 1.0 из JSON в JS не отличить от 1 — это проверяет только бэк. */
export function workDaysError(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return 'Нужен хотя бы один рабочий день'
  if (!value.every((day) => Number.isInteger(day) && day >= 1 && day <= 7)) return 'Рабочие дни — числа от 1 до 7'
  return new Set(value).size === value.length ? null : 'Рабочие дни не должны повторяться'
}
