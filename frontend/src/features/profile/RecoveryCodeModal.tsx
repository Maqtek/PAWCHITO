import { useState } from 'react'
import { api } from '../../api/client'
import { errorMessage } from '../../api/error-messages'
import { ApiError } from '../../api/errors'
import { authLimits } from '../../api/limits'
import { unwrap } from '../../api/queries'
import { FormActions, Modal, PasswordField } from '../../components/ui'
import { useForm } from '../../lib/use-form'
import { requiredError } from '../auth/checks'
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
            className="mt-0"
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
    validate: (values) => ({ current_password: requiredError(values.current_password, { trim: false }) }),
    context: 'recovery-code',
    onBusyChange,
    onSubmit: async ({ current_password }) => {
      const result = await unwrap(
        api.POST('/users/me/recovery-code', {
          body: { current_password },
        }),
      )
      onIssued(result.recovery_code)
    },
    onError: (error) =>
      error instanceof ApiError && error.status === 400
        ? { fields: { current_password: errorMessage(error, 'recovery-code') } }
        : undefined,
  })

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">Старый код перестанет действовать. Подтвердите действие паролем.</p>
      <PasswordField
        label="Текущий пароль"
        autoComplete="current-password"
        maxLength={authLimits.passwordMax}
        {...form.field('current_password')}
      />
      <FormActions
        error={form.formError}
        submitting={form.submitting}
        submitLabel="Получить новый код"
        submittingLabel="Получаем…"
        onCancel={onCancel}
      />
    </form>
  )
}
