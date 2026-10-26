import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { errorMessage } from '../../api/error-messages'
import { ApiError } from '../../api/errors'
import { authLimits } from '../../api/limits'
import { meQuery, unwrap } from '../../api/queries'
import type { User } from '../../api/schema'
import { signInWith } from '../../api/session'
import { Button, FormAlert, linkClass, TextField } from '../../components/ui'
import { EmailField, NewPasswordFields } from '../../features/auth/AuthFields'
import { emailError, newPasswordErrors, requiredError } from '../../features/auth/checks'
import { RecoveryCodeScreen } from '../../features/auth/RecoveryCodeScreen'
import { useRedirectSignedIn } from '../../features/session/useRedirectSignedIn'
import { AuthLayout } from '../../layouts/AuthLayout'
import { useForm } from '../../lib/use-form'

interface Issued {
  code: string
  user: User
}

export function RegisterPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [issued, setIssued] = useState<Issued | null>(null)
  // Пока показан код, пользователь уже вошёл — не уводим его с экрана кода.
  const { checking } = useRedirectSignedIn(issued === null)

  const form = useForm({
    initial: { full_name: '', email: '', password: '', password_repeat: '' },
    validate: (values) => {
      const passwords = newPasswordErrors(values.password, values.password_repeat)
      return {
        full_name: requiredError(values.full_name),
        email: emailError(values.email),
        password: passwords.password,
        password_repeat: passwords.repeat,
      }
    },
    context: 'register',
    onSubmit: async ({ full_name, email, password }) => {
      const result = await signInWith((signal) =>
        unwrap(
          api.POST('/auth/register', { body: { full_name: full_name.trim(), email: email.trim(), password }, signal }),
        ),
      )
      setIssued({ code: result.recovery_code, user: result.user })
    },
    onError: (error, values) =>
      error instanceof ApiError && error.status === 409
        ? {
            fields: {
              email: (
                <>
                  {errorMessage(error, 'register')}{' '}
                  <Link to="/login" state={{ email: values.email.trim() }} className={linkClass}>
                    Войти
                  </Link>
                </>
              ),
            },
          }
        : undefined,
  })

  if (issued) {
    return (
      <AuthLayout title="Регистрация">
        <RecoveryCodeScreen
          code={issued.code}
          onContinue={() => {
            queryClient.clear()
            queryClient.setQueryData(meQuery.queryKey, issued.user)
            navigate('/', { replace: true })
          }}
        />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Регистрация" checking={checking && !form.submitting}>
      <form noValidate onSubmit={form.handleSubmit} className="mt-6 flex flex-col gap-4">
        <TextField label="Имя" autoComplete="name" maxLength={authLimits.fullNameMax} {...form.field('full_name')} />
        <EmailField {...form.field('email')} />
        <NewPasswordFields label="Пароль" password={form.field('password')} repeat={form.field('password_repeat')} />
        <FormAlert message={form.formError} />
        {/* Не disabled: с выключенной кнопки фокус уходит на body. Повторную отправку отсекает useForm. */}
        <Button type="submit" fullWidth aria-disabled={form.submitting}>
          {form.submitting ? 'Регистрируем…' : 'Зарегистрироваться'}
        </Button>
      </form>
      <p className="mt-6 text-sm text-ink-muted">
        Уже есть аккаунт?{' '}
        <Link to="/login" className={linkClass}>
          Войти
        </Link>
      </p>
    </AuthLayout>
  )
}
