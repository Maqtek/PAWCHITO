import type { ReactNode } from 'react'
import { Button } from './Button'
import { FormAlert } from './FormAlert'

export interface FormActionsProps {
  /** Ошибка отправки над кнопками; null — ошибки нет. */
  error: string | null
  /** Запрос идёт: на кнопке отправки — submittingLabel, обе кнопки выглядят выключенными. */
  submitting: boolean
  submitLabel: ReactNode
  submittingLabel: ReactNode
  /** danger — для необратимого: архив, удаление, отмена записи. */
  variant?: 'primary' | 'danger'
  /** Без onCancel кнопки отмены нет. */
  onCancel?: () => void
  cancelLabel?: ReactNode
}

/**
 * Подвал формы: ошибка, отмена и отправка — прямые дети формы, отступы между ними задаёт она сама.
 * Кнопки не disabled, а aria-disabled: с выключенной кнопки фокус уходит на body. Повторную отправку отсекает useForm,
 * отмена во время запроса ничего не делает: отправленное не отменить, а окно должно дождаться ответа.
 */
export function FormActions({
  error,
  submitting,
  submitLabel,
  submittingLabel,
  variant = 'primary',
  onCancel,
  cancelLabel = 'Отмена',
}: FormActionsProps) {
  return (
    <>
      <FormAlert message={error} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button variant="secondary" aria-disabled={submitting} onClick={() => !submitting && onCancel()}>
            {cancelLabel}
          </Button>
        )}
        <Button type="submit" variant={variant} aria-disabled={submitting}>
          {submitting ? submittingLabel : submitLabel}
        </Button>
      </div>
    </>
  )
}
