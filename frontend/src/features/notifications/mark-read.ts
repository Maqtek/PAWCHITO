import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import { queryKeys } from '../../api/queries'
import type { Notification } from '../../api/schema'

/**
 * Переход по уведомлению отмечает его прочитанным (БП §9). Переход ответа не ждёт; после отметки перечитываем всё
 * под ['notifications'] — и списки, и счётчик в шапке.
 */
export function markNotificationRead(queryClient: QueryClient, notification: Notification): void {
  if (notification.read_at !== null) return
  void api
    .POST('/notifications/{id}/read', { params: { path: { id: notification.id } } })
    .finally(() => void queryClient.invalidateQueries({ queryKey: queryKeys.allNotifications }))
}
