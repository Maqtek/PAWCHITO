import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { unreadCountQuery } from '../api/queries'
import { CountBadge, Dropdown } from '../components/ui'
import { NotificationList } from '../features/notifications/NotificationList'

export function NotificationBell() {
  const { data } = useQuery(unreadCountQuery)
  const count = data?.unread_count ?? 0
  const label = count > 0 ? `Уведомления, непрочитанных: ${count}` : 'Уведомления'

  return (
    <Dropdown
      label={label}
      button={
        <span className="relative grid size-10 place-items-center rounded-xl text-ink-muted hover:bg-surface">
          <Bell aria-hidden className="size-5" />
          <CountBadge count={count} className="absolute -top-0.5 -right-0.5" />
        </span>
      }
    >
      {(close) => <NotificationList onClose={close} />}
    </Dropdown>
  )
}
