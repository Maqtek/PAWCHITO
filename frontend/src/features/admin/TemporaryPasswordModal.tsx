import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api/client'
import { errorMessage } from '../../api/error-messages'
import { ApiError } from '../../api/errors'
import { authLimits } from '../../api/limits'
import { queryKeys, unwrap } from '../../api/queries'
import { Button, FormAlert, Modal, TextField } from '../../components/ui'
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
    onSubmit: async ({ email }) => {
      onBusyChange(true)
      try {
        const result = await unwrap(
          api.POST('/admin/clinics/{id}/account', {
            params: { path: { id: clinicId } },
            body: { email: email.trim() },
          }),
        )
        onIssued(result.temporary_password)
      } finally {
        // Перечитываем и после ошибки: при 409 аккаунт уже есть, после таймаута он мог создаться.
        void queryClient.invalidateQueries({ queryKey: queryKeys.adminClinics })
        onBusyChange(false)
      }
    },
    onError: (error) =>
      error instanceof ApiError && error.status === 409
        ? { fields: { email: errorMessage(error, 'clinic-account') } }
        : undefined,
  })

  function cancel() {
    if (!form.submitting) onCancel()
  }

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
      <FormAlert message={form.formError} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" aria-disabled={form.submitting} onClick={cancel}>
          Отмена
        </Button>
        {/* Не disabled: с выключенной кнопки фокус уходит на body. Повторную отправку отсекает useForm. */}
        <Button type="submit" aria-disabled={form.submitting}>
          {form.submitting ? 'Создаём…' : 'Создать аккаунт'}
        </Button>
      </div>
    </form>
  )
}

function ResetPasswordForm({ clinicId, onIssued, onBusyChange, onCancel }: PasswordRequestProps) {
  const queryClient = useQueryClient()
  const form = useForm({
    initial: {},
    validate: () => ({}),
    context: 'clinic-account',
    onSubmit: async () => {
      onBusyChange(true)
      try {
        const result = await unwrap(
          api.POST('/admin/clinics/{id}/account/reset-password', {
            params: { path: { id: clinicId } },
          }),
        )
        onIssued(result.temporary_password)
      } finally {
        // Перечитываем и после ошибки: карточка покажет, что с аккаунтом на самом деле (например, 404 — его нет).
        void queryClient.invalidateQueries({ queryKey: queryKeys.adminClinics })
        onBusyChange(false)
      }
    },
  })

  function cancel() {
    if (!form.submitting) onCancel()
  }

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">Клиника выйдет на всех устройствах и при входе задаст новый пароль.</p>
      <FormAlert message={form.formError} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" aria-disabled={form.submitting} onClick={cancel}>
          Отмена
        </Button>
        <Button type="submit" aria-disabled={form.submitting}>
          {form.submitting ? 'Сбрасываем…' : 'Сбросить пароль'}
        </Button>
      </div>
    </form>
  )
}
