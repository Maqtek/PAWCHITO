import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { validationMessages } from '../../api/error-messages'
import { authLimits } from '../../api/limits'
import { unwrap } from '../../api/queries'
import { Button, FormAlert, linkClass, PasswordField, Spinner, TextField } from '../../components/ui'
import { newPasswordErrors } from '../../features/auth/checks'
import { RecoveryCodeScreen } from '../../features/auth/RecoveryCodeScreen'
import { useRedirectSignedIn } from '../../features/session/useRedirectSignedIn'
import { AuthLayout } from '../../layouts/AuthLayout'
import { isRecoveryCode, normalizeRecoveryCode } from '../../lib/recovery-code'
import { useForm } from '../../lib/use-form'

interface Issued {
  code: string
  email: string
}

export function RecoverPage() {
  const navigate = useNavigate()
  const [issued, setIssued] = useState<Issued | null>(null)
  const { checking } = useRedirectSignedIn(issued === null)

  const form = useForm({
    initial: { email: '', recovery_code: '', new_password: '', password_repeat: '' },
    validate: (values) => {
      const passwords = newPasswordErrors(values.new_password, values.password_repeat)
      const code = normalizeRecoveryCode(values.recovery_code)
      let codeError: string | undefined
      if (code === '') codeError = validationMessages.required
      else if (!isRecoveryCode(code)) codeError = validationMessages.recoveryCode
      return {
        email: values.email.trim() ? undefined : validationMessages.required,
        recovery_code: codeError,
        new_password: passwords.password,
        password_repeat: passwords.repeat,
      }
    },
    context: 'recover',
    onSubmit: async ({ email, recovery_code, new_password }) => {
      // Восстановление — не вход: сервер завершает все сессии и выдаёт новый код.
      const result = await unwrap(
        api.POST('/auth/recover', {
          body: { email: email.trim(), recovery_code: normalizeRecoveryCode(recovery_code), new_password },
        }),
      )
      setIssued({ code: result.recovery_code, email: email.trim() })
    },
  })

  if (issued) {
    return (
      <AuthLayout title="Восстановление доступа">
        <RecoveryCodeScreen
          code={issued.code}
          onContinue={() =>
            navigate('/login', { replace: true, state: { reason: 'password-recovered', email: issued.email } })
          }
        />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Восстановление доступа">
      {checking ? (
        <div className="mt-6">
          <Spinner label="Проверяем вход" />
        </div>
      ) : (
        <>
          <form noValidate onSubmit={form.handleSubmit} className="mt-6 flex flex-col gap-4">
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              inputMode="email"
              maxLength={authLimits.emailMax}
              {...form.field('email')}
            />
            <TextField
              label="Код восстановления"
              hint="16 символов, например K7QM-2XPA-9RTD-4WNB, регистр не важен"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={40}
              {...form.field('recovery_code')}
            />
            <PasswordField
              label="Новый пароль"
              hint="Не короче 8 символов"
              autoComplete="new-password"
              maxLength={authLimits.passwordMax}
              {...form.field('new_password')}
            />
            <PasswordField
              label="Повтор пароля"
              autoComplete="new-password"
              maxLength={authLimits.passwordMax}
              {...form.field('password_repeat')}
            />
            <FormAlert message={form.formError} />
            <Button type="submit" fullWidth disabled={form.submitting}>
              {form.submitting ? 'Проверяем…' : 'Восстановить доступ'}
            </Button>
          </form>
          <p className="mt-6 text-sm text-ink-muted">
            Вспомнили пароль?{' '}
            <Link to="/login" className={linkClass}>
              Войти
            </Link>
          </p>
        </>
      )}
    </AuthLayout>
  )
}
