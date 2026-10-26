import { useState, type ReactNode } from 'react'
import type { ErrorContext } from '../api/error-messages'
import { useForm } from '../lib/use-form'
import { FormActions, Modal } from './ui'

interface ConfirmActionModalProps {
  open: boolean
  title: string
  /** Подпись кнопки и подпись на время запроса: «В архив» / «Переносим…». */
  submitLabel: string
  submittingLabel: string
  /** По умолчанию danger: подтверждают обычно необратимое. */
  variant?: 'primary' | 'danger'
  cancelLabel?: string
  /** Запрос и обновление кэша; ошибка остаётся в окне. */
  onConfirm: () => Promise<void>
  onClose: () => void
  /** Откуда текст ошибки сервера. */
  context: ErrorContext
  children: ReactNode
}

/**
 * Подтверждение действия в окне: пояснение, ошибка, отмена и кнопка действия. Например, архив особенности здоровья,
 * удаление прививки, пропуск и удаление дела.
 */
export function ConfirmActionModal({
  open,
  title,
  submitLabel,
  submittingLabel,
  variant = 'danger',
  cancelLabel,
  onConfirm,
  onClose,
  context,
  children,
}: ConfirmActionModalProps) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal open={open} onClose={onClose} title={title} dismissible={!busy}>
      {open && (
        <ConfirmActionForm
          submitLabel={submitLabel}
          submittingLabel={submittingLabel}
          variant={variant}
          cancelLabel={cancelLabel}
          onConfirm={onConfirm}
          onCancel={onClose}
          onBusyChange={setBusy}
          context={context}
        >
          {children}
        </ConfirmActionForm>
      )}
    </Modal>
  )
}

interface ConfirmActionFormProps {
  submitLabel: string
  submittingLabel: string
  variant?: 'primary' | 'danger'
  cancelLabel?: string
  onConfirm: () => Promise<void>
  onCancel: () => void
  /** Запрос идёт: окно нельзя закрыть, иначе действие применится, а ответ или ошибку показать будет некому. */
  onBusyChange: (busy: boolean) => void
  context: ErrorContext
  children: ReactNode
}

/** Подтверждение без своего окна: для окна, которое после подтверждения показывает результат, — временного пароля клиники. */
export function ConfirmActionForm({
  submitLabel,
  submittingLabel,
  variant = 'danger',
  cancelLabel,
  onConfirm,
  onCancel,
  onBusyChange,
  context,
  children,
}: ConfirmActionFormProps) {
  const form = useForm({ initial: {}, validate: () => ({}), context, onBusyChange, onSubmit: onConfirm })

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
      {children}
      <FormActions
        error={form.formError}
        submitting={form.submitting}
        submitLabel={submitLabel}
        submittingLabel={submittingLabel}
        variant={variant}
        onCancel={onCancel}
        cancelLabel={cancelLabel}
      />
    </form>
  )
}
