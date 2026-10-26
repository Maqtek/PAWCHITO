import { healthLimits } from '../api/limits'
import { moscowIsoDate } from '../lib/format'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Ровно ГГГГ-ММ-ДД, существующая дата, не раньше 1900-01-01 — как у дат питомца и здоровья (Р-41, Р-45, Р-46). */
export function isoDateError(value: unknown, label: string): string | null {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return `${label} в формате ГГГГ-ММ-ДД`
  // Строки одного формата сравниваются как даты. Граница — до разбора: Date.UTC читает годы 0–99 как 1900–1999.
  if (value < healthLimits.dateMin) return `${label} — не раньше 1900 года`
  // Date.UTC переносит 30 февраля на 2 марта — такая дата не совпадёт со строкой и не пройдёт.
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value ? null : 'Такой даты нет'
}

/** Дата, которая уже наступила: как isoDateError и не позже сегодняшнего дня по Москве. */
export function pastDateError(value: unknown, label: string, today = new Date()): string | null {
  const invalid = isoDateError(value, label)
  if (invalid) return invalid
  return (value as string) > moscowIsoDate(today) ? `${label} — не позже сегодняшнего дня` : null
}
