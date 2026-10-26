import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../api/queries'
import type { Vet } from '../../api/schema'

function refetchVets(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.clinicVets })
}

/**
 * Изменение врача. Ответ сервера — свежий врач: заменяет прежнего в списке (нового — добавляет).
 * Список перечитывается и после успеха (запрос, начатый до изменения, не должен вернуть старое, а в другой вкладке
 * могли поменять других врачей), и после сбоя: запрос упал или не дождался ответа, а изменение могло примениться.
 */
export async function saveVet(queryClient: QueryClient, request: Promise<Vet>): Promise<Vet> {
  const vet = await request.catch((error: unknown) => {
    refetchVets(queryClient)
    throw error
  })
  queryClient.setQueryData<Vet[]>(queryKeys.clinicVets, (list) => {
    if (!list) return list
    return list.some((item) => item.id === vet.id) ? list.map((item) => (item.id === vet.id ? vet : item)) : [...list, vet]
  })
  refetchVets(queryClient)
  return vet
}
