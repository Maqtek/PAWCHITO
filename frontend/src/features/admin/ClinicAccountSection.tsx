import { KeyRound, UserPlus } from 'lucide-react'
import { useState } from 'react'
import type { AdminClinic } from '../../api/schema'
import { Button, Card } from '../../components/ui'
import { TemporaryPasswordModal } from './TemporaryPasswordModal'

type Dialog = 'create' | 'reset' | null

const doneMessages = {
  create: 'Аккаунт создан. Временный пароль передан клинике.',
  reset: 'Пароль сброшен. Временный пароль передан клинике.',
} as const

interface ClinicAccountSectionProps {
  clinic: AdminClinic
  onStatus: (message: string) => void
}

export function ClinicAccountSection({ clinic, onStatus }: ClinicAccountSectionProps) {
  const [dialog, setDialog] = useState<Dialog>(null)
  const archived = clinic.archived_at !== null
  const account = clinic.account

  function open(next: Exclude<Dialog, null>) {
    onStatus('')
    setDialog(next)
  }

  function accountStatus(isActive: boolean): string {
    if (isActive) return 'Активен'
    return archived ? 'Заблокирован — клиника скрыта' : 'Заблокирован'
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-extrabold">Аккаунт клиники</h2>
      {account ? (
        <>
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <dt className="text-sm text-ink-muted">Email</dt>
            <dd className="font-bold break-words">{account.email}</dd>
            <dt className="text-sm text-ink-muted">Статус</dt>
            <dd className="font-bold">{accountStatus(account.is_active)}</dd>
          </dl>
          {!archived && (
            <Button variant="secondary" icon={KeyRound} className="mt-4" onClick={() => open('reset')}>
              Сбросить пароль
            </Button>
          )}
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-ink-muted">Клиника не может войти, пока нет аккаунта.</p>
          {!archived && (
            <Button icon={UserPlus} className="mt-4" onClick={() => open('create')}>
              Создать аккаунт
            </Button>
          )}
        </>
      )}
      {/* Окно — вне ветвей: после создания аккаунта карточка перерисуется, а пароль должен остаться на экране. */}
      <TemporaryPasswordModal
        mode={dialog ?? 'create'}
        open={dialog !== null}
        clinicId={clinic.id}
        onClose={() => setDialog(null)}
        onDone={() => {
          if (dialog) onStatus(doneMessages[dialog])
          setDialog(null)
        }}
      />
    </Card>
  )
}
