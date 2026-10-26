import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import { queryKeys, unwrap } from '../../api/queries'
import type { Reminder, ReminderMarked } from '../../api/schema'
import { NBSP, pluralize } from '../../lib/format'
import { dueDay, formatDue } from '../calendar/due'

/** Отметка дела: следующее дело серии сервер создаёт сам (Р-61). */
export function markReminder(id: number, action: 'done' | 'skip'): Promise<ReminderMarked> {
  const options = { params: { path: { id } } }
  return unwrap(action === 'done' ? api.POST('/reminders/{id}/done', options) : api.POST('/reminders/{id}/skip', options))
}

export function deleteReminder(id: number): Promise<void> {
  return unwrap(api.DELETE('/reminders/{id}', { params: { path: { id } } }))
}

/**
 * После отметки, нового дела или удаления перечитываем все списки дел и прогресс курсов: порядок, следующее дело серии
 * и просроченность знает сервер. И после ошибки тоже — изменение могло примениться.
 */
export function refetchReminders(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.reminders })
}

/** Отметить можно дело на сегодня или просроченное (Р-61). */
export const canMark = (reminder: Reminder, today: string) => reminder.status === 'pending' && dueDay(reminder.due_at) <= today

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
