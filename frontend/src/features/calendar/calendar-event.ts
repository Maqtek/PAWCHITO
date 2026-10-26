import type { Calendar, CalendarReminderEvent, Reminder } from '../../api/schema'
import { addDays } from '../../lib/dates'
import { formatDayDate, formatShortDate } from '../../lib/format'

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
  if (key === 'today') return formatDayDate(today)
  if (key === 'tomorrow') return formatDayDate(addDays(today, 1))
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
