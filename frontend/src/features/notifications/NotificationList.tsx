import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { errorMessage } from '../../api/error-messages'
import { notificationsQuery, queryKeys, unwrap } from '../../api/queries'
import type { Notification } from '../../api/schema'
import { Button, FormAlert, Spinner } from '../../components/ui'
import { cn } from '../../lib/cn'
import { markNotificationRead } from './mark-read'
import { NotificationRowContent } from './NotificationRowContent'

/** Список уведомлений в выпадающей панели колокольчика: последние 50, от новых к старым (БП §9). */
export function NotificationList({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data, isPending, refetch } = useQuery(notificationsQuery)
  const [error, setError] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)

  /** Список и счётчик в шапке — под общим ключом ['notifications']. */
  function refresh() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.allNotifications })
  }

  function open(notification: Notification) {
    markNotificationRead(queryClient, notification)
    onClose()
    navigate(notification.link)
  }

  async function readAll() {
    if (markingAll) return
    setError(null)
    setMarkingAll(true)
    try {
      await unwrap(api.POST('/notifications/read-all'))
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setMarkingAll(false)
      refresh()
    }
  }

  function content() {
    if (isPending) return <Spinner label="Загружаем уведомления" />
    if (!data) {
      return (
        <div className="flex flex-col items-start gap-2 px-3 py-3">
          <p className="text-sm">Не удалось загрузить уведомления.</p>
          <Button size="sm" variant="secondary" onClick={() => void refetch()}>
            Повторить
          </Button>
        </div>
      )
    }
    if (data.items.length === 0) return <p className="px-3 py-4 text-sm text-ink-muted">Уведомлений пока нет.</p>
    return (
      <ul className="flex flex-col">
        {data.items.map((notification) => (
          <li key={notification.id}>
            <button
              type="button"
              onClick={() => open(notification)}
              className={cn(
                'flex w-full cursor-pointer gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-surface-muted',
                notification.read_at === null ? 'font-bold text-ink' : 'text-ink-muted',
              )}
            >
              <NotificationRowContent notification={notification} />
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="w-[min(22rem,calc(100vw-2rem))]">
      <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
        <h2 className="text-sm font-extrabold">Уведомления</h2>
        {data && data.unread_count > 0 && (
          <Button size="sm" variant="secondary" aria-disabled={markingAll} onClick={() => void readAll()}>
            {markingAll ? 'Отмечаем…' : 'Прочитать все'}
          </Button>
        )}
      </div>
      {error && (
        <div className="px-3 pb-2">
          <FormAlert message={error} />
        </div>
      )}
      {content()}
    </div>
  )
}
