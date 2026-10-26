import { useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { sessionReasonMessage } from '../../api/error-messages'
import { authLimits } from '../../api/limits'
import { meQuery, unwrap } from '../../api/queries'
import { signInWith } from '../../api/session'
import { homePathFor } from '../../app/navigation'
import { Button, FormAlert, linkClass, PasswordField } from '../../components/ui'
import { EmailField } from '../../features/auth/AuthFields'
import { requiredError } from '../../features/auth/checks'
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
    if (location.state === null) return
    const { pathname, search, hash } = location
    navigate({ pathname, search, hash }, { replace: true, state: null })
  }, [location, navigate])

  const form = useForm({
    initial: { email: arrival.email, password: '' },
    validate: ({ email, password }) => ({
      email: requiredError(email),
      password: requiredError(password, { trim: false }),
    }),
    context: 'login',
    onSubmit: async ({ email, password }) => {
      await signInWith((signal) => unwrap(api.POST('/auth/login', { body: { email: email.trim(), password }, signal })))
      queryClient.clear()
      const user = await queryClient.fetchQuery(meQuery)
      navigate(homePathFor(user.role), { replace: true })
    },
  })

  // При входе кэш очищается и me запрашивается заново — форма не должна мигать спиннером.
  const showChecking = checking && !form.submitting

  // Причину выхода озвучиваем фокусом: область, появившаяся вместе со страницей, скринридером не читается.
  useEffect(() => {
    if (!showChecking && arrival.reason) reasonRef.current?.focus()
  }, [showChecking, arrival.reason])

  return (
    <AuthLayout title="Вход" checking={showChecking}>
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
        <EmailField {...form.field('email')} />
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
        {/* Не disabled: с выключенной кнопки фокус уходит на body. Повторную отправку отсекает useForm. */}
        <Button type="submit" fullWidth aria-disabled={form.submitting}>
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
    </AuthLayout>
  )
}
