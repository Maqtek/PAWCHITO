import { useQueryClient } from '@tanstack/react-query'
import { Check, SkipForward } from 'lucide-react'
import { useState } from 'react'
import { errorMessage } from '../../api/error-messages'
import type { Reminder, ReminderMarked } from '../../api/schema'
import { Button, FormAlert } from '../../components/ui'
import { markReminder, refetchReminders } from './reminder-actions'

interface MarkActionsProps {
  reminder: Reminder
  /** Подпись для скринридера: в списке много одинаковых «Выполнено». */
  label: string
  onDone: (result: ReminderMarked) => void
  /** Пропуск — с подтверждением: отметка окончательная (Р-61). */
  onSkip: () => void
  onStatus: (message: string) => void
}

/** «Выполнено» — одной кнопкой: так отмечают дела каждый день. «Пропустить» открывает подтверждение. */
export function MarkActions({ reminder, label, onDone, onSkip, onStatus }: MarkActionsProps) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const forRecord = <span className="sr-only">, {label}</span>

  async function done() {
    if (busy) return
    onStatus('')
    setError(null)
    setBusy(true)
    try {
      onDone(await markReminder(reminder.id, 'done'))
    } catch (failure) {
      setError(errorMessage(failure, 'reminder'))
    } finally {
      setBusy(false)
      refetchReminders(queryClient)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {/* Не disabled: с выключенной кнопки фокус уходит на body. Повторное нажатие отсекает busy. */}
        <Button size="sm" icon={Check} aria-disabled={busy} onClick={() => void done()}>
          {busy ? 'Отмечаем…' : 'Выполнено'}
          {forRecord}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={SkipForward}
          aria-disabled={busy}
          onClick={() => {
            if (busy) return
            setError(null)
            onSkip()
          }}
        >
          Пропустить
          {forRecord}
        </Button>
      </div>
      <FormAlert message={error} />
    </div>
  )
}
