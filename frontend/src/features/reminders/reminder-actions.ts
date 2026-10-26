import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import { queryKeys, unwrap } from '../../api/queries'
import type { Reminder, ReminderMarked } from '../../api/schema'
import { REQUEST_TIMEOUT_MS } from '../../api/session'
import { addDays, moscowLocal } from '../../lib/dates'
import { formatTime, NBSP, pluralize } from '../../lib/format'
import { formatSlot } from '../appointments/format'

/** Отметка дела: следующее дело серии сервер создаёт сам (Р-61). */
export function markReminder(id: number, action: 'done' | 'skip'): Promise<ReminderMarked> {
  const options = { params: { path: { id } }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
  return unwrap(action === 'done' ? api.POST('/reminders/{id}/done', options) : api.POST('/reminders/{id}/skip', options))
}

export function deleteReminder(id: number): Promise<void> {
  return unwrap(api.DELETE('/reminders/{id}', { params: { path: { id } }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }))
}

/**
 * После отметки, нового дела или удаления перечитываем все списки дел и прогресс курсов: порядок, следующее дело серии
 * и просроченность знает сервер. И после ошибки тоже — изменение могло примениться.
 */
export function refetchReminders(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.reminders })
}

/** День дела по Москве, «YYYY-MM-DD». */
export const dueDay = (reminder: Pick<Reminder, 'due_at'>) => moscowLocal(new Date(reminder.due_at)).date

/** Отметить можно дело на сегодня или просроченное (Р-61). */
export const canMark = (reminder: Reminder, today: string) => reminder.status === 'pending' && dueDay(reminder) <= today

/** «сегодня, 18:00», «завтра, 21:00», иначе «пятница, 30 октября, 10:00». */
export function formatDue(dueAt: string, today: string): string {
  const day = moscowLocal(new Date(dueAt)).date
  if (day === today) return `сегодня, ${formatTime(dueAt)}`
  if (day === addDays(today, 1)) return `завтра, ${formatTime(dueAt)}`
  return formatSlot(dueAt)
}

/** «Каждый день», «Раз в 7 дней» (БП §7). */
export function repeatLabel(days: number): string {
  return days === 1 ? 'Каждый день' : `Раз в ${days}${NBSP}${pluralize(days, ['день', 'дня', 'дней'])}`
}

/** Текст статуса после отметки: что отмечено и когда следующее дело серии. */
export function markedMessage({ reminder, next }: ReminderMarked, today: string): string {
  const what = reminder.status === 'done' ? 'Выполнено' : 'Пропущено'
  return `${what}: ${reminder.title}.` + (next ? ` Следующее — ${formatDue(next.due_at, today)}.` : '')
}

/** Откуда дело и как повторяется: «По курсу лечения», «Раз в 7 дней», «Без повтора». */
export function scheduleLabel(reminder: Reminder): string {
  if (reminder.source === 'prescription') return 'По курсу лечения'
  return reminder.repeat_interval_days !== null ? repeatLabel(reminder.repeat_interval_days) : 'Без повтора'
}
