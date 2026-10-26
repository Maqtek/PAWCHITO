import { reminderLimits } from '../api/limits'
import type { EventCategory } from '../api/schema'
import { addDays, moscowLocal } from '../lib/dates'
import { isIsoDateTime } from './date-validation'
import { textError } from './text-validation'

const CATEGORIES: readonly EventCategory[] = ['treatment', 'routine', 'prevention']

export const reminderTitleError = (value: unknown) => textError(value, 'Название', reminderLimits.titleMax)

/** Время своего дела: со смещением, с точностью до минуты, от текущей минуты до года вперёд по Москве (Р-59). */
export function dueAtError(value: unknown, now: Date): string | null {
  if (!isIsoDateTime(value)) return 'Дата и время — со смещением, например 2026-10-20T08:00:00+03:00'
  const due = new Date(value)
  if (due.getUTCSeconds() !== 0 || due.getUTCMilliseconds() !== 0) return 'Время — с точностью до минуты'
  const currentMinute = Math.floor(now.getTime() / 60_000) * 60_000
  if (due.getTime() < currentMinute) return 'Это время уже прошло'
  const lastDay = addDays(moscowLocal(now).date, reminderLimits.daysAhead)
  return moscowLocal(due).date > lastDay ? 'Не дальше чем на год вперёд' : null
}

export function categoryError(value: unknown): string | null {
  return CATEGORIES.includes(value as EventCategory) ? null : 'Тип: treatment, routine или prevention'
}

/** Повтор: null — без повтора, иначе целое число дней от 1 до 365 (БП §7). */
export function repeatError(value: unknown): string | null {
  if (value === null) return null
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= reminderLimits.repeatMin &&
    value <= reminderLimits.repeatMax
    ? null
    : `Повтор — от ${reminderLimits.repeatMin} до ${reminderLimits.repeatMax} дней`
}
