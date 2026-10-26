import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../api/queries'

/**
 * После подтверждения или отмены перечитываются все вкладки записей и карточки питомцев: запись могла перейти
 * из «Требуют решения» в обычное расписание, а у питомца — пропасть единственная неотменённая запись (Р-54).
 * То же — когда запрос упал или не дождался ответа, а на сервере изменение могло примениться.
 */
export function refetchClinicAppointments(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.clinicAppointments })
  void queryClient.invalidateQueries({ queryKey: queryKeys.allClinicPets })
}
