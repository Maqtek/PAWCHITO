import { useState, type ReactNode } from 'react'
import { Button, FormAlert, Modal } from '../../components/ui'
import { useForm } from '../../lib/use-form'

interface ConfirmActionModalProps {
  open: boolean
  title: string
  /** Подпись кнопки и подпись на время запроса: «В архив» / «Переносим…». */
  submit: string
  submitting: string
  /** Запрос и обновление кэша; ошибка остаётся в окне. */
  onConfirm: () => Promise<void>
  onClose: () => void
  children: ReactNode
}

/** Подтверждение необратимого для владельца действия с записью здоровья: архив особенности, удаление прививки. */
export function ConfirmActionModal({ open, title, submit, submitting, onConfirm, onClose, children }: ConfirmActionModalProps) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal open={open} onClose={onClose} title={title} dismissible={!busy}>
      {open && (
        <ConfirmForm submit={submit} submitting={submitting} onConfirm={onConfirm} onCancel={onClose} onBusyChange={setBusy}>
          {children}
        </ConfirmForm>
      )}
    </Modal>
  )
}

interface ConfirmFormProps {
  submit: string
  submitting: string
  onConfirm: () => Promise<void>
  onCancel: () => void
  /** Запрос идёт: окно нельзя закрыть, иначе действие применится, а ответ или ошибку показать будет некому. */
  onBusyChange: (busy: boolean) => void
  children: ReactNode
}

function ConfirmForm({ submit, submitting, onConfirm, onCancel, onBusyChange, children }: ConfirmFormProps) {
  const form = useForm({
    initial: {},
    validate: () => ({}),
    context: 'health',
    onSubmit: async () => {
      onBusyChange(true)
      try {
        await onConfirm()
      } finally {
        onBusyChange(false)
      }
    },
  })

  // Не disabled и без действия на время запроса: отправленное не отменить, а окно должно дождаться ответа.
  function cancel() {
    if (!form.submitting) onCancel()
  }

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
      {children}
      <FormAlert message={form.formError} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" aria-disabled={form.submitting} onClick={cancel}>
          Отмена
        </Button>
        {/* Не disabled: с выключенной кнопки фокус уходит на body. Повторную отправку отсекает useForm. */}
        <Button type="submit" variant="danger" aria-disabled={form.submitting}>
          {form.submitting ? submitting : submit}
        </Button>
      </div>
    </form>
  )
}
