import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { errorMessage } from '../../api/error-messages'
import { notificationsQuery, unwrap } from '../../api/queries'
import type { Notification } from '../../api/schema'
import { REQUEST_TIMEOUT_MS } from '../../api/session'
import { Button, FormAlert, Spinner } from '../../components/ui'
import { cn } from '../../lib/cn'
import { formatShortDate, formatTime } from '../../lib/format'

/** Список уведомлений в выпадающей панели колокольчика: последние 50, от новых к старым (БП §9). */
export function NotificationList({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data, isPending, refetch } = useQuery(notificationsQuery)
  const [error, setError] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)

  /** Список и счётчик в шапке — под общим ключом ['notifications']. */
  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  // Переход по уведомлению отмечает его прочитанным; переход не ждёт ответа — отметку подхватит следующий опрос.
  function open(notification: Notification) {
    if (notification.read_at === null) {
      void api
        .POST('/notifications/{id}/read', { params: { path: { id: notification.id } } })
        .finally(refresh)
    }
    onClose()
    navigate(notification.link)
  }

  async function readAll() {
    if (markingAll) return
    setError(null)
    setMarkingAll(true)
    try {
      await unwrap(api.POST('/notifications/read-all', { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }))
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
        {data.items.map((notification) => {
          const unread = notification.read_at === null
          return (
            <li key={notification.id}>
              <button
                type="button"
                onClick={() => open(notification)}
                className={cn(
                  'flex w-full cursor-pointer gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-surface-muted',
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
              </button>
            </li>
          )
        })}
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
