import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../api/queries'
import type { AdminClinic } from '../../api/schema'

/** Перечитываем список клиник и страницу клиники, если она есть. */
export function refetchClinic(queryClient: QueryClient, clinicId?: number): void {
  // exact: ключ списка — префикс ключей страниц клиник, перечитываем только нужную.
  void queryClient.invalidateQueries({ queryKey: queryKeys.adminClinics, exact: true })
  if (clinicId !== undefined) void queryClient.invalidateQueries({ queryKey: queryKeys.adminClinic(clinicId) })
}

/** Ответ — клиника или результат со свежей клиникой внутри (скрытие). */
type ClinicResult = AdminClinic | { clinic: AdminClinic }

/**
 * Изменение клиники. Ответ сервера — свежая клиника: в кэш страницы клиники, список перезапросится.
 * Запрос упал или не дождался ответа, а на сервере изменение могло примениться: перечитываем список и страницу клиники
 * (clinicId — если она уже есть), иначе повтор создаст дубль или покажет устаревшее.
 */
export async function saveClinic<T extends ClinicResult>(
  queryClient: QueryClient,
  request: Promise<T>,
  clinicId?: number,
): Promise<T> {
  const result = await request.catch((error: unknown) => {
    refetchClinic(queryClient, clinicId)
    throw error
  })
  const value: ClinicResult = result
  const clinic = 'clinic' in value ? value.clinic : value
  queryClient.setQueryData(queryKeys.adminClinic(clinic.id), clinic)
  refetchClinic(queryClient)
  return result
}
