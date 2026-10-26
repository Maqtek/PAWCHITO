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

interface StoreOptions {
  /** Запись ушла из списка: в архив или удалена. */
  remove?: boolean
  /** Новую запись — в начало списка: там новые даты. */
  prepend?: boolean
}

/**
 * Изменение записи здоровья. Ответ сервера — свежая запись: заменяет прежнюю, новую добавляет, архивную или удалённую
 * убирает. Список перечитывается и после успеха (сервер знает порядок, а в другой вкладке могли поменять другие записи),
 * и после сбоя: запрос упал или не дождался ответа, а на сервере изменение могло примениться.
 * У удаления ответа нет — request возвращает удалённую запись сам.
 */
export async function saveRecord<T extends { id: number }>(
  queryClient: QueryClient,
  queryKey: HealthListKey,
  request: Promise<T>,
  { remove = false, prepend = false }: StoreOptions = {},
): Promise<T> {
  const record = await request.catch((error: unknown) => {
    invalidateList(queryClient, queryKey)
    throw error
  })
  queryClient.setQueryData<T[]>(queryKey, (list) => {
    if (!list) return list
    if (remove) return list.filter((item) => item.id !== record.id)
    if (list.some((item) => item.id === record.id)) return list.map((item) => (item.id === record.id ? record : item))
    return prepend ? [record, ...list] : [...list, record]
  })
  invalidateList(queryClient, queryKey)
  return record
}
