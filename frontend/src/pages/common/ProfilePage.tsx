import { useQuery } from '@tanstack/react-query'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { meQuery } from '../../api/queries'
import { Button, Card } from '../../components/ui'
import { ChangePasswordModal } from '../../features/profile/ChangePasswordModal'
import { NameField } from '../../features/profile/NameField'
import { RecoveryCodeModal } from '../../features/profile/RecoveryCodeModal'
import { PageHeader } from '../../layouts/PageHeader'
import { roleLabel } from '../../lib/labels'

type Dialog = 'password' | 'code'

export function ProfilePage() {
  const { data: user } = useQuery(meQuery)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [status, setStatus] = useState('')
  if (!user) return null

  // Прошлое сообщение убираем: повтор такого же текста иначе не озвучится, а старый не висит рядом с новым окном.
  const openDialog = (next: Dialog) => {
    setStatus('')
    setDialog(next)
  }
  const close = () => setDialog(null)
  // Поздний ответ уже закрытого окна не должен закрыть то, что открыто сейчас.
  const finish = (from: Dialog, message: string) => {
    setDialog((current) => (current === from ? null : current))
    setStatus(message)
  }

  return (
    <>
      <PageHeader title="Профиль" description="Данные вашего аккаунта." />
      <div className="flex max-w-xl flex-col gap-6">
        <Card className="p-6">
          <h2 className="text-lg font-extrabold">Данные аккаунта</h2>
          <div className="mt-4 flex flex-col gap-3">
            <NameField user={user} />
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
              <dt className="text-sm text-ink-muted">Email</dt>
              <dd className="font-bold break-words">{user.email}</dd>
              <dt className="text-sm text-ink-muted">Роль</dt>
              <dd className="font-bold">{roleLabel[user.role]}</dd>
            </dl>
          </div>
        </Card>
        <Card className="p-6">
          <h2 className="text-lg font-extrabold">Безопасность</h2>
          <div className="mt-4 flex flex-col items-start gap-4">
            <Button variant="secondary" icon={KeyRound} onClick={() => openDialog('password')}>
              Сменить пароль
            </Button>
            {user.role === 'owner' && (
              <div className="flex flex-col items-start gap-2">
                <p className="text-sm text-ink-muted">
                  Код нужен, чтобы восстановить доступ без пароля. Новый код заменит старый.
                </p>
                <Button variant="secondary" icon={ShieldCheck} onClick={() => openDialog('code')}>
                  Новый код восстановления
                </Button>
              </div>
            )}
          </div>
          <p role="status" className="mt-4 text-sm font-semibold text-primary empty:mt-0">
            {status}
          </p>
        </Card>
      </div>
      <ChangePasswordModal
        open={dialog === 'password'}
        onClose={close}
        onChanged={() => finish('password', 'Пароль изменён. Другие сессии завершены.')}
      />
      {user.role === 'owner' && (
        <RecoveryCodeModal
          open={dialog === 'code'}
          onClose={close}
          onDone={() => finish('code', 'Новый код сохранён. Старый больше не действует.')}
        />
      )}
    </>
  )
}
