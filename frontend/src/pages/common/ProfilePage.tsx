import { useQuery } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { meQuery } from '../../api/queries'
import { Card } from '../../components/ui'
import { PageHeader } from '../../layouts/PageHeader'
import { roleLabel } from '../../lib/labels'
import { StagePlaceholder } from '../StagePlaceholder'

export function ProfilePage() {
  const { data: user } = useQuery(meQuery)
  if (!user) return null

  return (
    <>
      <PageHeader title="Профиль" description="Данные вашего аккаунта." />
      <Card className="max-w-xl p-6">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[8rem_1fr]">
          <dt className="text-sm text-ink-muted">Имя</dt>
          <dd className="font-bold">{user.full_name}</dd>
          <dt className="text-sm text-ink-muted">Email</dt>
          <dd className="font-bold">{user.email}</dd>
          <dt className="text-sm text-ink-muted">Роль</dt>
          <dd className="font-bold">{roleLabel[user.role]}</dd>
        </dl>
      </Card>
      <StagePlaceholder className="mt-6 max-w-xl" stage={2} icon={KeyRound} title="Смена пароля и код восстановления" />
    </>
  )
}
