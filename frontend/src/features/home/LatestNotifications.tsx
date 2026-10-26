import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { latestNotificationsQuery, queryKeys } from '../../api/queries'
import type { Notification } from '../../api/schema'
import { Button, SectionCard, Spinner } from '../../components/ui'
import { cn } from '../../lib/cn'
import { formatShortDate, formatTime } from '../../lib/format'

/** Сколько уведомлений на главной (БП §8); весь список — в колокольчике. */
const LATEST = 5

/** Последние уведомления: переход по ссылке отмечает уведомление прочитанным, как в колокольчике (БП §9). */
export function LatestNotifications() {
  const queryClient = useQueryClient()
  const { data, isPending, refetch } = useQuery(latestNotificationsQuery(LATEST))

  // Переход не ждёт ответа; после отметки перечитываем всё под ['notifications'] — и список, и счётчик в шапке.
  function markRead(notification: Notification) {
    if (notification.read_at !== null) return
    void api
      .POST('/notifications/{id}/read', { params: { path: { id: notification.id } } })
      .finally(() => void queryClient.invalidateQueries({ queryKey: queryKeys.allNotifications }))
  }

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
        {data.items.map((notification) => {
          const unread = notification.read_at === null
          return (
            <li key={notification.id}>
              <Link
                to={notification.link}
                onClick={() => markRead(notification)}
                className={cn(
                  'flex gap-2.5 rounded-xl px-3 py-2.5 text-sm hover:bg-surface-muted',
                  unread ? 'font-bold text-ink' : 'text-ink-muted',
                )}
              >
                <span
                  aria-hidden
                  className={cn('mt-1.5 size-2 shrink-0 rounded-full', unread ? 'bg-primary' : 'bg-transparent')}
                />
                <span className="min-w-0 flex-1">
                  {/* Пробел — отдельным узлом: конечный пробел внутри span при сборке доступного имени теряется. */}
                  {unread && <span className="sr-only">Новое:</span>}{' '}
                  <span className="block break-words">{notification.text}</span>
                  <span className="mt-0.5 block text-xs font-semibold text-ink-muted">
                    {formatShortDate(notification.created_at)}, {formatTime(notification.created_at)}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    )
  }

  return <SectionCard title="Уведомления">{content()}</SectionCard>
}
