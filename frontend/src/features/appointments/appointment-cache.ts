import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../api/queries'
import type { Appointment } from '../../api/schema'

/**
 * Ответ сервера — свежая запись: в карточку и в список питомца сразу, затем всё перечитывается.
 * Слоты тоже: новая запись заняла время врача, отмена его освободила.
 */
export function storeAppointment(queryClient: QueryClient, appointment: Appointment): void {
  queryClient.setQueryData(queryKeys.appointment(appointment.id), appointment)
  queryClient.setQueryData<Appointment[]>(queryKeys.petAppointments(appointment.pet.id), (list) => {
    if (!list) return list
    return list.some((item) => item.id === appointment.id)
      ? list.map((item) => (item.id === appointment.id ? appointment : item))
      : [appointment, ...list]
  })
  refetchAppointments(queryClient)
}

/** Запрос упал или не дождался ответа, а на сервере изменение могло примениться — перечитываем записи и слоты. */
export function refetchAppointments(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.appointments })
  void queryClient.invalidateQueries({ queryKey: ['booking', 'slots'] })
}

/** Отменить может только владелец и только до начала приёма (Р-48). */
export function isCancellable(appointment: Appointment, now: Date): boolean {
  return (
    (appointment.status === 'requested' || appointment.status === 'confirmed') &&
    new Date(appointment.slot_start).getTime() > now.getTime()
  )
}
