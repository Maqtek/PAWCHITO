import { addDays, moscowLocal } from '../../lib/dates'
import { formatDayDate, formatTime } from '../../lib/format'
import { CALENDAR_DAYS } from './calendar-event'

/** День срока по Москве, «YYYY-MM-DD»: срок дела, записи к врачу. */
export const dueDay = (dueAt: string) => moscowLocal(new Date(dueAt)).date

/** День «YYYY-MM-DD»: «сегодня», «завтра», иначе «пятница, 30 октября». Так же — срок прививки, у него нет времени. */
export function formatDueDay(day: string, today: string): string {
  if (day === today) return 'сегодня'
  if (day === addDays(today, 1)) return 'завтра'
  return formatDayDate(day)
}

/** «сегодня, 18:00», «завтра, 21:00», иначе «пятница, 30 октября, 10:00». */
export function formatDue(dueAt: string, today: string): string {
  return `${formatDueDay(dueDay(dueAt), today)}, ${formatTime(dueAt)}`
}

/**
 * Как formatDue, но дело дальше 30 дней в другом году — с годом: свои дела бывают и на год вперёд (Р-59), и
 * «20 октября» в списке дальних дел иначе читается как прошедшая дата.
 */
export function formatDueWithYear(dueAt: string, today: string): string {
  const day = dueDay(dueAt)
  const year = day.slice(0, 4)
  if (day <= addDays(today, CALENDAR_DAYS) || year === today.slice(0, 4)) return formatDue(dueAt, today)
  return `${formatDayDate(day)} ${year}, ${formatTime(dueAt)}`
}
