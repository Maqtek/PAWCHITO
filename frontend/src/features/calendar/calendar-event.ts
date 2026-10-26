import type { Calendar, CalendarReminderEvent, Reminder } from '../../api/schema'
import { addDays, moscowLocal } from '../../lib/dates'
import { formatDayDate, formatShortDate, formatTime } from '../../lib/format'
import { formatDue } from '../reminders/reminder-actions'

/** Календарь показывает события с сегодня по сегодня + 30 дней; дела дальше — отдельным списком (Р-65). */
export const CALENDAR_DAYS = 30

type CalendarGroupKey = keyof Calendar

/** Группы по порядку (БП §8). */
export const calendarGroups: readonly { key: CalendarGroupKey; title: string }[] = [
  { key: 'today', title: 'Сегодня' },
  { key: 'tomorrow', title: 'Завтра' },
  { key: 'later', title: 'Позже' },
]

/** День группы: «среда, 28 октября», у «Позже» — «с 30 октября по 27 ноября». */
export function groupPeriod(key: CalendarGroupKey, today: string): string {
  const dayDate = (day: string) => formatDayDate(new Date(`${day}T12:00:00+03:00`))
  if (key === 'today') return dayDate(today)
  if (key === 'tomorrow') return dayDate(addDays(today, 1))
  return `с ${formatShortDate(addDays(today, 2))} по ${formatShortDate(addDays(today, CALENDAR_DAYS))}`
}

/**
 * Дело из события календаря — для тех же отметки, удаления и подписей, что и в списке дел, без второго запроса.
 * Рецепта, серии и времени отметки в событии нет: запланированному делу они не нужны ни для кнопок, ни для текста.
 */
export function eventReminder(event: CalendarReminderEvent, petId: number): Reminder {
  const { id, at, title, category, status, is_overdue, source, repeat_interval_days } = event
  return {
    id,
    pet_id: petId,
    source,
    prescription_id: null,
    title,
    category,
    due_at: at,
    status,
    is_overdue,
    done_at: null,
    repeat_interval_days,
    series_id: null,
  }
}

/** Срок прививки «YYYY-MM-DD»: «сегодня», «завтра», иначе «пятница, 30 октября». */
export function formatDueDay(day: string, today: string): string {
  if (day === today) return 'сегодня'
  if (day === addDays(today, 1)) return 'завтра'
  return formatDayDate(new Date(`${day}T12:00:00+03:00`))
}

/**
 * Как formatDue, но дело дальше 30 дней в другом году — с годом: свои дела бывают и на год вперёд (Р-59), и
 * «20 октября» в списке дальних дел иначе читается как прошедшая дата.
 */
export function formatDueWithYear(dueAt: string, today: string): string {
  const day = moscowLocal(new Date(dueAt)).date
  const year = day.slice(0, 4)
  if (day <= addDays(today, CALENDAR_DAYS) || year === today.slice(0, 4)) return formatDue(dueAt, today)
  return `${formatDayDate(new Date(dueAt))} ${year}, ${formatTime(dueAt)}`
}
