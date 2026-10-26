import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../api/queries'
import type { Pet } from '../../api/schema'

/**
 * Ответ сервера — свежий питомец: заменяет прежнего в списке (нового — добавляет), архивный убирает —
 * GET /pets отдаёт только активных. Список перечитывается: запрос, начатый до изменения, не должен вернуть старое,
 * а в другой вкладке могли поменять других питомцев.
 */
export function storePet(queryClient: QueryClient, pet: Pet): void {
  queryClient.setQueryData<Pet[]>(queryKeys.pets, (list) => {
    if (!list) return list
    if (pet.archived_at !== null) return list.filter((item) => item.id !== pet.id)
    return list.some((item) => item.id === pet.id) ? list.map((item) => (item.id === pet.id ? pet : item)) : [...list, pet]
  })
  void queryClient.invalidateQueries({ queryKey: queryKeys.pets })
}

/** Запрос изменения упал или не дождался ответа, а на сервере изменение могло примениться — перечитываем список. */
export function refetchPetsAfterFailure(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.pets })
}
