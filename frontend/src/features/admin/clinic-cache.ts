import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../api/queries'
import type { AdminClinic } from '../../api/schema'

/** Ответ сервера — свежая клиника: в кэш страницы клиники, список перезапросится. */
export function storeClinic(queryClient: QueryClient, clinic: AdminClinic): void {
  queryClient.setQueryData(queryKeys.adminClinic(clinic.id), clinic)
  // exact: ключ списка — префикс ключей страниц клиник, их перезапрашивать незачем.
  void queryClient.invalidateQueries({ queryKey: queryKeys.adminClinics, exact: true })
}

/**
 * Запрос изменения упал или не дождался ответа, а на сервере изменение могло примениться:
 * перечитываем список и страницу клиники (если она есть), иначе повтор создаст дубль или покажет устаревшее.
 */
export function refetchAfterFailure(queryClient: QueryClient, clinicId?: number): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.adminClinics, exact: true })
  if (clinicId !== undefined) void queryClient.invalidateQueries({ queryKey: queryKeys.adminClinic(clinicId) })
}
