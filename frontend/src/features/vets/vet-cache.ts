import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../api/queries'
import type { Vet } from '../../api/schema'

/**
 * Ответ сервера — свежий врач: заменяет прежнего в списке (нового — добавляет). Список перечитывается:
 * запрос, начатый до изменения, не должен вернуть старое, а в другой вкладке могли поменять других врачей.
 */
export function storeVet(queryClient: QueryClient, vet: Vet): void {
  queryClient.setQueryData<Vet[]>(queryKeys.clinicVets, (list) => {
    if (!list) return list
    return list.some((item) => item.id === vet.id) ? list.map((item) => (item.id === vet.id ? vet : item)) : [...list, vet]
  })
  void queryClient.invalidateQueries({ queryKey: queryKeys.clinicVets })
}

/** Запрос изменения упал или не дождался ответа, а на сервере изменение могло примениться — перечитываем список. */
export function refetchVetsAfterFailure(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.clinicVets })
}
