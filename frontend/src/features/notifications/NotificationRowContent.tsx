import type { Notification } from '../../api/schema'
import { cn } from '../../lib/cn'
import { formatShortDate, formatTime } from '../../lib/format'

/** Строка уведомления: метка непрочитанного, текст и время. Обёртка — ссылка или кнопка — у списка. */
export function NotificationRowContent({ notification }: { notification: Notification }) {
  const unread = notification.read_at === null

  return (
    <>
      <span aria-hidden className={cn('mt-1.5 size-2 shrink-0 rounded-full', unread ? 'bg-primary' : 'bg-transparent')} />
      <span className="min-w-0 flex-1">
        {/* Пробел — отдельным узлом: конечный пробел внутри span при сборке доступного имени теряется. */}
        {unread && <span className="sr-only">Новое:</span>}{' '}
        <span className="block break-words">{notification.text}</span>
        <span className="mt-0.5 block text-xs font-semibold text-ink-muted">
          {formatShortDate(notification.created_at)}, {formatTime(notification.created_at)}
        </span>
      </span>
    </>
  )
}
