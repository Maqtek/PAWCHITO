import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { latestNotificationsQuery } from '../../api/queries'
import { Button, SectionCard, Spinner } from '../../components/ui'
import { cn } from '../../lib/cn'
import { markNotificationRead } from '../notifications/mark-read'
import { NotificationRowContent } from '../notifications/NotificationRowContent'

/** Сколько уведомлений на главной (БП §8); весь список — в колокольчике. */
const LATEST = 5

/** Последние уведомления: переход по ссылке отмечает уведомление прочитанным, как в колокольчике (БП §9). */
export function LatestNotifications() {
  const queryClient = useQueryClient()
  const { data, isPending, refetch } = useQuery(latestNotificationsQuery(LATEST))

  function content() {
    if (isPending) return <Spinner className="mt-3" label="Загружаем уведомления" />
    if (!data) {
      return (
        <div className="mt-3 flex flex-col items-start gap-2">
          <p className="text-sm">Не удалось загрузить уведомления.</p>
          <Button size="sm" variant="secondary" onClick={() => void refetch()}>
            Повторить
          </Button>
        </div>
      )
    }
    if (data.items.length === 0) return <p className="mt-3 text-sm text-ink-muted">Уведомлений пока нет.</p>
    return (
      <ul className="-mx-3 mt-2 flex flex-col">
        {data.items.map((notification) => (
          <li key={notification.id}>
            <Link
              to={notification.link}
              onClick={() => markNotificationRead(queryClient, notification)}
              className={cn(
                'flex gap-2.5 rounded-xl px-3 py-2.5 text-sm hover:bg-surface-muted',
                notification.read_at === null ? 'font-bold text-ink' : 'text-ink-muted',
              )}
            >
              <NotificationRowContent notification={notification} />
            </Link>
          </li>
        ))}
      </ul>
    )
  }

  return <SectionCard title="Уведомления">{content()}</SectionCard>
}
