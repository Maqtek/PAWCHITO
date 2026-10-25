import { lazy, Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import { sessionReasonMessage } from '../../api/error-messages'
import { Card } from '../../components/ui'
import { Logo } from '../../layouts/Logo'
import { mocksEnabled } from '../../mocks/enabled'

// Вход seed-аккаунтами — только в dev-сборке с моками: прямая проверка DEV вырезает чанк из продакшена.
const MockLogin =
  import.meta.env.DEV && mocksEnabled
    ? lazy(() => import('../../mocks/MockLogin').then((module) => ({ default: module.MockLogin })))
    : null

/** До #29 — заглушка: причина выхода и, с моками, вход seed-аккаунтом. */
export function LoginPage() {
  const location = useLocation()
  const reason = sessionReasonMessage((location.state as { reason?: unknown } | null)?.reason)

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <title>Вход — PAWCHITO</title>
      <Card className="w-full max-w-sm p-8">
        <Logo />
        <h1 className="mt-6 text-2xl font-extrabold">Вход</h1>
        {reason && (
          <p role="status" className="mt-4 rounded-xl bg-sand p-3 text-sm text-sand-ink">
            {reason}
          </p>
        )}
        <p className="mt-2 text-sm text-ink-muted">Вход по email и паролю появится на этапе 2 роадмапа.</p>
        {MockLogin && (
          <Suspense fallback={null}>
            <MockLogin />
          </Suspense>
        )}
      </Card>
    </div>
  )
}
