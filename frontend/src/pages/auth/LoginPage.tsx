import { useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { sessionReasonMessage, validationMessages } from '../../api/error-messages'
import { authLimits } from '../../api/limits'
import { meQuery, unwrap } from '../../api/queries'
import { signInWith } from '../../api/session'
import { homePathFor } from '../../app/navigation'
import { Button, FormAlert, linkClass, PasswordField, Spinner, TextField } from '../../components/ui'
import { useRedirectSignedIn } from '../../features/session/useRedirectSignedIn'
import { AuthLayout } from '../../layouts/AuthLayout'
import { useForm } from '../../lib/use-form'
import { mocksEnabled } from '../../mocks/enabled'

// Вход seed-аккаунтами — только в dev-сборке с моками: прямая проверка DEV вырезает чанк из продакшена.
const MockLogin =
  import.meta.env.DEV && mocksEnabled
    ? lazy(() => import('../../mocks/MockLogin').then((module) => ({ default: module.MockLogin })))
    : null

interface LoginState {
  reason?: unknown
  email?: unknown
}

export function LoginPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { checking } = useRedirectSignedIn()
  // Причину и email берём из state один раз: потом state убирается, и перезагрузка причину не повторит.
  const [arrival] = useState(() => {
    const state = (location.state ?? {}) as LoginState
    return {
      reason: sessionReasonMessage(state.reason),
      email: typeof state.email === 'string' ? state.email : '',
    }
  })
  const reasonRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (location.state !== null) navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, navigate])

  // Причину выхода озвучиваем фокусом: область, появившаяся вместе со страницей, скринридером не читается.
  useEffect(() => {
    if (!checking && arrival.reason) reasonRef.current?.focus()
  }, [checking, arrival.reason])

  const form = useForm({
    initial: { email: arrival.email, password: '' },
    validate: ({ email, password }) => ({
      email: email.trim() ? undefined : validationMessages.required,
      password: password ? undefined : validationMessages.required,
    }),
    context: 'login',
    onSubmit: async ({ email, password }) => {
      await signInWith(() => unwrap(api.POST('/auth/login', { body: { email: email.trim(), password } })))
      queryClient.clear()
      const user = await queryClient.fetchQuery(meQuery)
      navigate(homePathFor(user.role), { replace: true })
    },
  })

  return (
    <AuthLayout title="Вход">
      {checking ? (
        <div className="mt-6">
          <Spinner label="Проверяем вход" />
        </div>
      ) : (
        <>
          {arrival.reason && (
            <p
              ref={reasonRef}
              role="status"
              tabIndex={-1}
              className="mt-4 rounded-xl bg-sand p-3 text-sm text-sand-ink outline-none"
            >
              {arrival.reason}
            </p>
          )}
          <form noValidate onSubmit={form.handleSubmit} className="mt-6 flex flex-col gap-4">
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              inputMode="email"
              maxLength={authLimits.emailMax}
              {...form.field('email')}
            />
            <PasswordField
              label="Пароль"
              autoComplete="current-password"
              maxLength={authLimits.passwordMax}
              {...form.field('password')}
            />
            <Link to="/recover" className={`${linkClass} self-start text-sm`}>
              Забыли пароль?
            </Link>
            <FormAlert message={form.formError} />
            <Button type="submit" fullWidth disabled={form.submitting}>
              {form.submitting ? 'Входим…' : 'Войти'}
            </Button>
          </form>
          <p className="mt-6 text-sm text-ink-muted">
            Нет аккаунта?{' '}
            <Link to="/register" className={linkClass}>
              Зарегистрироваться
            </Link>
          </p>
          {MockLogin && (
            <Suspense fallback={null}>
              <MockLogin />
            </Suspense>
          )}
        </>
      )}
    </AuthLayout>
  )
}
