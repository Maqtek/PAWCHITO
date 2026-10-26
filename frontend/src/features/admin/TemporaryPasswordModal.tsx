import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api/client'
import { errorMessage } from '../../api/error-messages'
import { ApiError } from '../../api/errors'
import { authLimits } from '../../api/limits'
import { queryKeys, unwrap } from '../../api/queries'
import { ConfirmActionForm } from '../../components/ConfirmActionModal'
import { FormActions, Modal, TextField } from '../../components/ui'
import { useForm } from '../../lib/use-form'
import { emailError } from '../auth/checks'
import { RevealOnceScreen } from '../auth/RevealOnceScreen'

interface TemporaryPasswordModalProps {
  mode: 'create' | 'reset'
  open: boolean
  clinicId: number
  onClose: () => void
  /** Пароль показан и передан — «Готово». */
  onDone: () => void
}

/** Создание аккаунта или сброс пароля, затем временный пароль. Пока идёт запрос или пароль на экране, окно не закрыть. */
export function TemporaryPasswordModal({ mode, open, clinicId, onClose, onDone }: TemporaryPasswordModalProps) {
  const [password, setPassword] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const formProps = { clinicId, onIssued: setPassword, onBusyChange: setBusy, onCancel: onClose }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Аккаунт клиники' : 'Сброс пароля'}
      dismissible={password === null && !busy}
    >
      {open &&
        (password === null ? (
          mode === 'create' ? (
            <CreateAccountForm {...formProps} />
          ) : (
            <ResetPasswordForm {...formProps} />
          )
        ) : (
          <RevealOnceScreen
            secret={password}
            heading="Временный пароль клиники"
            note="Передайте пароль клинике. При первом входе она задаст свой. Повторно пароль не показывается — если потеряется, сбросьте его ещё раз."
            confirmLabel="Пароль передан клинике"
            copiedText="Пароль скопирован"
            manualText="Выделите пароль и скопируйте вручную"
            continueLabel="Готово"
            headingLevel="h3"
            className="mt-0"
            onContinue={() => {
              // Пароль живёт только в состоянии окна и стирается сразу после подтверждения.
              setPassword(null)
              onDone()
            }}
          />
        ))}
    </Modal>
  )
}

interface PasswordRequestProps {
  clinicId: number
  onIssued: (password: string) => void
  /** Запрос идёт: окно нельзя закрыть, иначе пароль будет выдан, а показать его некому. */
  onBusyChange: (busy: boolean) => void
  onCancel: () => void
}

function CreateAccountForm({ clinicId, onIssued, onBusyChange, onCancel }: PasswordRequestProps) {
  const queryClient = useQueryClient()
  const form = useForm({
    initial: { email: '' },
    validate: (values) => ({ email: emailError(values.email) }),
    context: 'clinic-account',
    onBusyChange,
    onSubmit: async ({ email }) => {
      // Перечитываем и после ошибки: при 409 аккаунт уже есть, после таймаута он мог создаться.
      const result = await unwrap(
        api.POST('/admin/clinics/{id}/account', {
          params: { path: { id: clinicId } },
          body: { email: email.trim() },
        }),
      ).finally(() => void queryClient.invalidateQueries({ queryKey: queryKeys.adminClinics }))
      onIssued(result.temporary_password)
    },
    onError: (error) =>
      error instanceof ApiError && error.status === 409
        ? { fields: { email: errorMessage(error, 'clinic-account') } }
        : undefined,
  })

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">
        Клиника войдёт по этому email с временным паролем и при первом входе задаст свой.
      </p>
      <TextField
        label="Email клиники"
        type="email"
        inputMode="email"
        autoComplete="off"
        maxLength={authLimits.emailMax}
        {...form.field('email')}
      />
      <FormActions
        error={form.formError}
        submitting={form.submitting}
        submitLabel="Создать аккаунт"
        submittingLabel="Создаём…"
        onCancel={onCancel}
      />
    </form>
  )
}

function ResetPasswordForm({ clinicId, onIssued, onBusyChange, onCancel }: PasswordRequestProps) {
  const queryClient = useQueryClient()

  async function reset() {
    // Перечитываем и после ошибки: карточка покажет, что с аккаунтом на самом деле (например, 404 — его нет).
    const result = await unwrap(
      api.POST('/admin/clinics/{id}/account/reset-password', {
        params: { path: { id: clinicId } },
      }),
    ).finally(() => void queryClient.invalidateQueries({ queryKey: queryKeys.adminClinics }))
    onIssued(result.temporary_password)
  }

  return (
    <ConfirmActionForm
      submitLabel="Сбросить пароль"
      submittingLabel="Сбрасываем…"
      variant="primary"
      context="clinic-account"
      onConfirm={reset}
      onCancel={onCancel}
      onBusyChange={onBusyChange}
    >
      <p className="text-sm text-ink-muted">Клиника выйдет на всех устройствах и при входе задаст новый пароль.</p>
    </ConfirmActionForm>
  )
}
