import type { NotificationType } from '../api/schema'
import { toMoscowString } from '../lib/dates'
import { clinicDayLink, noticeText } from './notification-texts'
import type { MockAppointment, MockServerState } from './server-state'

/** Событие записи и кому о нём сообщить (БП §9): автор действия уведомление не получает (Р-55). */
export type AppointmentEvent =
  | 'requested'
  | 'cancelledByOwner'
  | 'cancelledPetArchived'
  | 'confirmed'
  | 'cancelledByClinic'
  | 'cancelledClinicUnavailable'

const eventType: Record<AppointmentEvent, NotificationType> = {
  requested: 'appointment_requested',
  cancelledByOwner: 'appointment_cancelled_by_owner',
  cancelledPetArchived: 'appointment_cancelled_pet_archived',
  confirmed: 'appointment_confirmed',
  cancelledByClinic: 'appointment_cancelled_by_clinic',
  cancelledClinicUnavailable: 'appointment_cancelled_clinic_unavailable',
}

function notify(state: MockServerState, userId: number, type: NotificationType, text: string, link: string): void {
  state.notifications.push({
    id: state.nextNotificationId,
    user_id: userId,
    type,
    text,
    link,
    created_at: toMoscowString(new Date()),
    read_at: null,
  })
  state.nextNotificationId += 1
}

/** Итог приёма — владельцу: статус ухода и число дел курса (БП §9). */
export function notifyOutcome(state: MockServerState, appointment: MockAppointment, careStatus: string, reminders: number): void {
  const pet = state.pets.find((item) => item.id === appointment.pet_id)
  if (!pet) return
  notify(state, pet.owner_id, 'outcome_added', noticeText.outcomeAdded(pet.name, careStatus, reminders), `/appointments/${appointment.id}`)
}

/** Клиника изменила данные или фото питомца — владельцу, с тем, что изменено (Р-57, Р-58). */
export function notifyPetUpdated(state: MockServerState, petId: number, clinicId: number, changes: string[]): void {
  const pet = state.pets.find((item) => item.id === petId)
  const clinic = state.clinics.find((item) => item.id === clinicId)
  if (!pet || !clinic || changes.length === 0) return
  notify(state, pet.owner_id, 'pet_updated_by_clinic', noticeText.petUpdated(clinic.name, pet.name, changes), '/pets')
}

/** Уведомление о записи: клинике — о заявке и отменах владельцем или системой, владельцу — о действиях клиники. */
export function notifyAppointment(state: MockServerState, appointment: MockAppointment, event: AppointmentEvent): void {
  const pet = state.pets.find((item) => item.id === appointment.pet_id)
  const vet = state.vets.find((item) => item.id === appointment.vet_id)
  const clinic = state.clinics.find((item) => item.id === vet?.clinic_id)
  if (!pet || !vet || !clinic) return
  const slot = appointment.slot_start
  const type = eventType[event]

  if (event === 'requested' || event === 'cancelledByOwner' || event === 'cancelledPetArchived') {
    // У клиники без аккаунта уведомлять некого.
    const account = state.accounts.find((item) => item.clinic_id === clinic.id)
    if (!account) return
    const text =
      event === 'requested'
        ? noticeText.requested(pet.name, slot, vet.full_name)
        : event === 'cancelledByOwner'
          ? noticeText.cancelledByOwner(pet.name, slot, vet.full_name)
          : noticeText.cancelledPetArchived(pet.name, slot)
    notify(state, account.id, type, text, clinicDayLink(slot))
    return
  }

  const text =
    event === 'confirmed'
      ? noticeText.confirmed(clinic.name, pet.name, slot, vet.full_name)
      : event === 'cancelledByClinic'
        ? noticeText.cancelledByClinic(clinic.name, pet.name, slot, appointment.clinic_comment ?? '')
        : noticeText.cancelledClinicUnavailable(clinic.name, pet.name, slot)
  notify(state, pet.owner_id, type, text, `/appointments/${appointment.id}`)
}
