import type { Clinic } from '../../api/schema'

/** Индекс — номер дня минус один: 1 — понедельник … 7 — воскресенье. */
export const weekdayShort = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const

/** «Ежедневно», «Пн–Сб» для подряд идущих (от трёх дней) или «Пн, Ср, Пт». */
export function formatWorkDays(days: number[]): string {
  const sorted = [...new Set(days)].filter((day) => Number.isInteger(day) && day >= 1 && day <= 7).sort((a, b) => a - b)
  if (sorted.length === 7) return 'Ежедневно'
  const consecutive = sorted.every((day, index) => index === 0 || day === sorted[index - 1] + 1)
  if (sorted.length >= 3 && consecutive) {
    return `${weekdayShort[sorted[0] - 1]}–${weekdayShort[sorted[sorted.length - 1] - 1]}`
  }
  return sorted.map((day) => weekdayShort[day - 1]).join(', ')
}

export function formatSchedule(clinic: Pick<Clinic, 'work_days' | 'opens_at' | 'closes_at'>): string {
  return `${formatWorkDays(clinic.work_days)}, ${clinic.opens_at}–${clinic.closes_at}`
}

export const PHONE = /^\+7\d{10}$/

/** Пробелы, скобки и дефисы не важны; 11 цифр с 8 или 7 в начале — российский номер. */
export function normalizePhone(input: string): string {
  const compact = input.replace(/[\s()-]/g, '')
  if (/^8\d{10}$/.test(compact)) return `+7${compact.slice(1)}`
  if (/^7\d{10}$/.test(compact)) return `+${compact}`
  return compact
}

export function formatPhone(phone: string): string {
  const match = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(phone)
  return match ? `+7 ${match[1]} ${match[2]}-${match[3]}-${match[4]}` : phone
}

/** Сетка слотов — 30 минут, поэтому и часы работы с шагом 30 минут. */
export const halfHourOptions: string[] = Array.from(
  { length: 48 },
  (_, index) => `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 === 0 ? '00' : '30'}`,
)

/** Значения формы — строки: рабочие дни хранятся как «1,2,3». */
export function parseWorkDays(value: string): number[] {
  return serializeWorkDays(value.split(',').map(Number))
    .split(',')
    .filter(Boolean)
    .map(Number)
}

export function serializeWorkDays(days: number[]): string {
  return [...new Set(days)]
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
    .sort((a, b) => a - b)
    .join(',')
}
