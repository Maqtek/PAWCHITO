import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { sessionReasonMessage } from '../../api/error-messages'
import type { Role } from '../../api/schema'
import { refreshAccessToken, signIn } from '../../api/session'
import { Button, Card, Eyebrow } from '../../components/ui'
import { Logo } from '../../layouts/Logo'
import { roleLabel } from '../../lib/labels'
import { mocksEnabled } from '../../mocks/enabled'
import { setMockRole } from '../../mocks/session'

const MOCK_ROLES: Role[] = ['owner', 'clinic', 'admin']

/** До этапа 2 — заглушка; с моками позволяет войти любой ролью. */
export function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const location = useLocation()
  const reason = sessionReasonMessage((location.state as { reason?: unknown } | null)?.reason)

  async function loginAs(role: Role) {
    // Временно до мок-сервера: роль в моках, токен — обменом cookie.
    setMockRole(role)
    const result = await refreshAccessToken()
    if (result.status === 'ok') signIn(result.token)
    queryClient.clear()
    navigate('/', { replace: true })
  }

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
        {mocksEnabled && (
          <div className="mt-6">
            <Eyebrow>Моки: войти как</Eyebrow>
            <div className="mt-3 grid gap-2">
              {MOCK_ROLES.map((role) => (
                <Button key={role} variant="secondary" fullWidth onClick={() => void loginAs(role)}>
                  {roleLabel[role]}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
