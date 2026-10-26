import { useQueryClient } from '@tanstack/react-query'
import type { Reminder, ReminderMarked } from '../../api/schema'
import { ConfirmActionModal } from '../../components/ConfirmActionModal'
import { formatDue } from '../calendar/due'
import { deleteReminder, markReminder, refetchReminders } from './reminder-actions'

interface ReminderConfirmModalProps {
  open: boolean
  kind: 'skip' | 'delete'
  reminder?: Reminder
  today: string
  onClose: () => void
  onSkipped: (result: ReminderMarked) => void
  /** Удаление — только в «Делах»: в «Курсе лечения» удалять нечего, дела курса не удаляются. */
  onDeleted?: () => void
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
        onDeleted?.()
      }
    } finally {
      refetchReminders(queryClient)
    }
  }

  return (
    <ConfirmActionModal
      open={open}
      title={kind === 'skip' ? 'Пропустить дело' : 'Удалить дело'}
      submitLabel={kind === 'skip' ? 'Пропустить' : 'Удалить'}
      submittingLabel={kind === 'skip' ? 'Отмечаем…' : 'Удаляем…'}
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
