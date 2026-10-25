import { useState } from 'react'
import { api } from '../../api/client'
import { errorMessage, validationMessages } from '../../api/error-messages'
import { ApiError } from '../../api/errors'
import { authLimits } from '../../api/limits'
import { unwrap } from '../../api/queries'
import { Button, FormAlert, Modal, PasswordField } from '../../components/ui'
import { useForm } from '../../lib/use-form'
import { RecoveryCodeScreen } from '../auth/RecoveryCodeScreen'

interface RecoveryCodeModalProps {
  open: boolean
  onClose: () => void
  /** Код показан и сохранён — «Готово». */
  onDone: () => void
}

/** Новый код восстановления: пароль, затем код. Пока код на экране, окно закрывается только «Готово». */
export function RecoveryCodeModal({ open, onClose, onDone }: RecoveryCodeModalProps) {
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <Modal open={open} onClose={onClose} title="Новый код восстановления" dismissible={code === null && !busy}>
      {open &&
        (code === null ? (
          <ConfirmPasswordForm onIssued={setCode} onBusyChange={setBusy} onCancel={onClose} />
        ) : (
          <RecoveryCodeScreen
            code={code}
            headingLevel="h3"
            continueLabel="Готово"
            onContinue={() => {
              // Код живёт только в состоянии окна и стирается сразу после подтверждения.
              setCode(null)
              onDone()
            }}
          />
        ))}
    </Modal>
  )
}

interface ConfirmPasswordFormProps {
  onIssued: (code: string) => void
  /** Запрос идёт: окно нельзя закрыть, иначе код будет выпущен, а показать его некому. */
  onBusyChange: (busy: boolean) => void
  onCancel: () => void
}

function ConfirmPasswordForm({ onIssued, onBusyChange, onCancel }: ConfirmPasswordFormProps) {
  const form = useForm({
    initial: { current_password: '' },
    validate: (values) => ({ current_password: values.current_password === '' ? validationMessages.required : undefined }),
    context: 'recovery-code',
    onSubmit: async ({ current_password }) => {
      onBusyChange(true)
      try {
        const result = await unwrap(api.POST('/users/me/recovery-code', { body: { current_password } }))
        onIssued(result.recovery_code)
      } finally {
        onBusyChange(false)
      }
    },
    onError: (error) =>
      error instanceof ApiError && error.status === 400
        ? { fields: { current_password: errorMessage(error, 'recovery-code') } }
        : undefined,
  })

  // Не disabled и без действия на время запроса: фокус остаётся на кнопке, а окно не закрывается раньше кода.
  function cancel() {
    if (!form.submitting) onCancel()
  }

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">Старый код перестанет действовать. Подтвердите действие паролем.</p>
      <PasswordField
        label="Текущий пароль"
        autoComplete="current-password"
        maxLength={authLimits.passwordMax}
        {...form.field('current_password')}
      />
      <FormAlert message={form.formError} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" aria-disabled={form.submitting} onClick={cancel}>
          Отмена
        </Button>
        {/* Не disabled: с выключенной кнопки фокус уходит на body. Повторную отправку отсекает useForm. */}
        <Button type="submit" aria-disabled={form.submitting}>
          {form.submitting ? 'Получаем…' : 'Получить новый код'}
        </Button>
      </div>
    </form>
  )
}
