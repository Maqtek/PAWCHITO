import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { errorMessage } from '../api/error-messages'
import { unwrap } from '../api/queries'
import type { Role } from '../api/schema'
import { signInWith } from '../api/session'
import { homePathFor } from '../app/navigation'
import { Button, Eyebrow } from '../components/ui'
import { SEED_PASSWORD } from './server-state'
import { resetMockServer } from './session'

interface SeedAccount {
  label: string
  email: string
  role: Role
}

const SEED_ACCOUNTS: SeedAccount[] = [
  { label: 'Владелец', email: 'owner@example.com', role: 'owner' },
  { label: 'Клиника', email: 'clinic@example.com', role: 'clinic' },
  { label: 'Клиника (временный пароль)', email: 'clinic-new@example.com', role: 'clinic' },
  { label: 'Администратор', email: 'admin@example.com', role: 'admin' },
]

/** Вход seed-аккаунтом через настоящий POST /auth/login. Только в разработке с моками. */
export function MockLogin() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  async function loginAs({ email, role }: SeedAccount) {
    setError(null)
    try {
      await signInWith(() => unwrap(api.POST('/auth/login', { body: { email, password: SEED_PASSWORD } })))
      queryClient.clear()
      navigate(homePathFor(role), { replace: true })
    } catch (caught) {
      setError(errorMessage(caught, 'login'))
    }
  }

  return (
    <div className="mt-6">
      <Eyebrow>Моки: войти как</Eyebrow>
      <div className="mt-3 grid gap-2">
        {SEED_ACCOUNTS.map((account) => (
          <Button key={account.email} variant="secondary" fullWidth onClick={() => void loginAs(account)}>
            {account.label}
          </Button>
        ))}
        <Button
          variant="ghost"
          fullWidth
          onClick={() => {
            resetMockServer()
            setError(null)
          }}
        >
          Сбросить моки
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-coral-ink">
          {error}
        </p>
      )}
    </div>
  )
}
