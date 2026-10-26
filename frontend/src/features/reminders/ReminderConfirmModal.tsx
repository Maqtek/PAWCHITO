import { useQueryClient } from '@tanstack/react-query'
import type { Reminder, ReminderMarked } from '../../api/schema'
import { ConfirmActionModal } from '../health/ConfirmActionModal'
import { deleteReminder, formatDue, markReminder, refetchReminders } from './reminder-actions'

interface ReminderConfirmModalProps {
  open: boolean
  kind: 'skip' | 'delete'
  reminder?: Reminder
  today: string
  onClose: () => void
  onSkipped: (result: ReminderMarked) => void
  /** Удаление — только в «Делах»: в «Курсе лечения» удалять нечего, дела курса не удаляются. */
  onDeleted?: (reminder: Reminder) => void
}

/** Пропуск и удаление дела — с подтверждением: отметку не отменить, удалённое не вернуть (Р-61, Р-62). */
export function ReminderConfirmModal({ open, kind, reminder, today, onClose, onSkipped, onDeleted }: ReminderConfirmModalProps) {
  const queryClient = useQueryClient()
  const when = reminder ? formatDue(reminder.due_at, today) : ''
  const repeats = reminder?.repeat_interval_days != null

  async function confirm() {
    if (!reminder) return
    try {
      if (kind === 'skip') {
        onSkipped(await markReminder(reminder.id, 'skip'))
      } else {
        await deleteReminder(reminder.id)
        onDeleted?.(reminder)
      }
    } finally {
      refetchReminders(queryClient)
    }
  }

  return (
    <ConfirmActionModal
      open={open}
      title={kind === 'skip' ? 'Пропустить дело' : 'Удалить дело'}
      submit={kind === 'skip' ? 'Пропустить' : 'Удалить'}
      submitting={kind === 'skip' ? 'Отмечаем…' : 'Удаляем…'}
      context="reminder"
      onConfirm={confirm}
      onClose={onClose}
    >
      {kind === 'skip' ? (
        <p className="text-sm">
          <span className="font-bold break-words">{reminder?.title}</span> — {when} — будет отмечено пропущенным. Отметку
          не отменить.{repeats && ' Следующее дело серии появится, как обычно.'}
        </p>
      ) : (
        <p className="text-sm">
          Дело <span className="font-bold break-words">{reminder?.title}</span> — {when} — будет удалено.
          {repeats && ' Повторы прекратятся: следующих дел этой серии не будет.'} Вернуть его нельзя — только добавить
          заново.
        </p>
      )}
    </ConfirmActionModal>
  )
}
