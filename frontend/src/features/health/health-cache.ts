import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../api/queries'

/** Ключ списка записей здоровья питомца: ['health', petId, вид]. */
type HealthListKey =
  | ReturnType<typeof queryKeys.conditions>
  | ReturnType<typeof queryKeys.observations>
  | ReturnType<typeof queryKeys.vaccinations>

/** Список перечитывается; наблюдения и прививки — ещё и элементы ленты (Р-66), поэтому вместе с ними и она. */
function invalidateList(queryClient: QueryClient, queryKey: HealthListKey): void {
  void queryClient.invalidateQueries({ queryKey })
  if (queryKey[2] !== 'conditions') void queryClient.invalidateQueries({ queryKey: queryKeys.timeline(queryKey[1]) })
}

/**
 * Ответ сервера — свежая запись здоровья: заменяет прежнюю, новую добавляет, архивную или удалённую убирает.
 * Список перечитывается: сервер знает порядок (новые даты сверху), а в другой вкладке могли поменять другие записи.
 */
export function storeRecord<T extends { id: number }>(
  queryClient: QueryClient,
  queryKey: HealthListKey,
  record: T,
  { remove = false, prepend = false }: { remove?: boolean; prepend?: boolean } = {},
): void {
  queryClient.setQueryData<T[]>(queryKey, (list) => {
    if (!list) return list
    if (remove) return list.filter((item) => item.id !== record.id)
    if (list.some((item) => item.id === record.id)) return list.map((item) => (item.id === record.id ? record : item))
    return prepend ? [record, ...list] : [...list, record]
  })
  invalidateList(queryClient, queryKey)
}

/** Запрос изменения упал или не дождался ответа, а на сервере изменение могло примениться — перечитываем список. */
export function refetchAfterFailure(queryClient: QueryClient, queryKey: HealthListKey): void {
  invalidateList(queryClient, queryKey)
}
