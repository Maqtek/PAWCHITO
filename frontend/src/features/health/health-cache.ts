import type { QueryClient, QueryKey } from '@tanstack/react-query'

/**
 * Ответ сервера — свежая запись здоровья: заменяет прежнюю, новую добавляет, архивную или удалённую убирает.
 * Список перечитывается: сервер знает порядок (новые даты сверху), а в другой вкладке могли поменять другие записи.
 */
export function storeRecord<T extends { id: number }>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  record: T,
  { remove = false, prepend = false }: { remove?: boolean; prepend?: boolean } = {},
): void {
  queryClient.setQueryData<T[]>(queryKey, (list) => {
    if (!list) return list
    if (remove) return list.filter((item) => item.id !== record.id)
    if (list.some((item) => item.id === record.id)) return list.map((item) => (item.id === record.id ? record : item))
    return prepend ? [record, ...list] : [...list, record]
  })
  void queryClient.invalidateQueries({ queryKey })
}

/** Запрос изменения упал или не дождался ответа, а на сервере изменение могло примениться — перечитываем список. */
export function refetchAfterFailure(queryClient: QueryClient, queryKey: QueryKey): void {
  void queryClient.invalidateQueries({ queryKey })
}
