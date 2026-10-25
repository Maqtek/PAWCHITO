import { Link } from 'react-router-dom'
import type { AdminClinic } from '../../api/schema'
import { Badge } from '../../components/ui'
import { formatSchedule } from './clinic-format'

export function AccountBadge({ clinic }: { clinic: AdminClinic }) {
  if (!clinic.account) return <Badge tone="butter">Нет аккаунта</Badge>
  if (!clinic.account.is_active) return <Badge tone="coral">Заблокирован</Badge>
  return (
    <Badge tone="neutral" className="max-w-full">
      <span className="truncate">{clinic.account.email}</span>
    </Badge>
  )
}

export function ClinicListItem({ clinic }: { clinic: AdminClinic }) {
  return (
    <Link
      to={`/admin/clinics/${clinic.id}`}
      className="block rounded-card border border-line bg-surface p-4 shadow-card transition-colors hover:border-primary-line focus-visible:border-primary"
    >
      <span className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0 font-extrabold break-words">{clinic.name}</span>
        <AccountBadge clinic={clinic} />
      </span>
      <span className="mt-1 block text-sm break-words text-ink-muted">{clinic.address}</span>
      <span className="mt-1 block text-sm text-ink-muted">{formatSchedule(clinic)}</span>
    </Link>
  )
}
