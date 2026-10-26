import { petLimits } from '../api/limits'
import type { Sex, Species } from '../api/schema'
import { moscowIsoDate } from '../lib/format'
import { charCount, hasControlChars } from './auth-validation'
import { textError } from './clinic-validation'

const SPECIES: readonly Species[] = ['dog', 'cat', 'other']
const SEXES: readonly Sex[] = ['male', 'female', 'unknown']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const petNameError = (value: unknown) => textError(value, 'Кличка', petLimits.nameMax)

export function speciesError(value: unknown): string | null {
  return SPECIES.includes(value as Species) ? null : 'Вид: собака, кошка или другое'
}

export function sexError(value: unknown): string | null {
  return SEXES.includes(value as Sex) ? null : 'Пол: male, female или unknown'
}

/** Необязательное поле: null и пустая строка — «порода не указана» (Р-41). */
export function breedError(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string') return 'Порода: ожидается строка'
  const text = value.trim()
  if (charCount(text) > petLimits.breedMax) return `Порода — не длиннее ${petLimits.breedMax} символов`
  return hasControlChars(text) ? 'Порода содержит недопустимые символы' : null
}

/** Ровно YYYY-MM-DD и существующая дата, с 1900-01-01 по сегодня в Москве (Р-41); null — дата не указана. */
export function birthDateError(value: unknown, today = new Date()): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return 'Дата рождения в формате ГГГГ-ММ-ДД'
  // Строки одного формата сравниваются как даты. Граница — до разбора: Date.UTC читает годы 0–99 как 1900–1999.
  if (value < petLimits.birthDateMin) return 'Дата рождения — не раньше 1900 года'
  // Date.UTC переносит 30 февраля на 2 марта — такая дата не совпадёт со строкой и не пройдёт.
  const [year, month, day] = value.split('-').map(Number)
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== value) return 'Такой даты нет'
  return value > moscowIsoDate(today) ? 'Дата рождения — не позже сегодняшнего дня' : null
}

/** Пустая после обрезки порода хранится как null. */
export function normalizeBreed(value: string | null | undefined): string | null {
  const text = value?.trim() ?? ''
  return text === '' ? null : text
}
