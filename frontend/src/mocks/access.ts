import type { AppointmentStatus, Condition, Observation, Pet, ReminderStatus, Vaccination } from '../api/schema'
import { isoDateError } from './date-validation'
import { authorizeAccount, fieldErrors, forbidden, notFound } from './http-utils'
import type { MockAccount, MockAppointment, MockReminder, MockServerState } from './server-state'

// Доступ к данным и общие выборки обработчиков.

/** Владелец из access-токена или готовый ответ 401/403. */
export function authorizeOwner(state: MockServerState, request: Request): MockAccount | Response {
  return authorizeAccount(state, request, { allowed: ['owner'] })
}

/** Администратор из access-токена или готовый ответ 401/403. */
export function authorizeAdmin(state: MockServerState, request: Request): MockAccount | Response {
  return authorizeAccount(state, request, { allowed: ['admin'] })
}

/** Клиника аккаунта из access-токена или готовый ответ 401/403. */
export function authorizeClinic(state: MockServerState, request: Request): number | Response {
  const account = authorizeAccount(state, request, { allowed: ['clinic'] })
  if (account instanceof Response) return account
  // У аккаунта клиники clinic_id есть всегда; без него — как без прав.
  return account.clinic_id ?? forbidden()
}

export const petNotFound = () => notFound('Питомец не найден')

/** Питомец владельца; питомец другого владельца — как несуществующий, 404 (Р-42). Архивный находится как обычно. */
export function findPet(state: MockServerState, ownerId: number, rawId: unknown): Pet | undefined {
  const id = Number(rawId)
  return state.pets.find((pet) => pet.id === id && pet.owner_id === ownerId)
}

/** Клиника записи — по врачу. */
export const clinicOf = (state: MockServerState, appointment: MockAppointment) =>
  state.vets.find((vet) => vet.id === appointment.vet_id)?.clinic_id

/** Запись своей клиники; запись другой клиники — как несуществующая, 404. */
export function findClinicAppointment(state: MockServerState, clinicId: number, rawId: unknown): MockAppointment | undefined {
  const id = Number(rawId)
  const appointment = state.appointments.find((item) => item.id === id)
  return appointment && clinicOf(state, appointment) === clinicId ? appointment : undefined
}

/** Карточка доступна, если у питомца есть неотменённая запись в эту клинику (Р-54). */
export function canReadCard(state: MockServerState, clinicId: number, petId: number): boolean {
  return state.appointments.some(
    (item) => item.pet_id === petId && item.status !== 'cancelled' && clinicOf(state, item) === clinicId,
  )
}

export const APPOINTMENT_STATUSES: readonly AppointmentStatus[] = ['requested', 'confirmed', 'completed', 'cancelled']

/** Записи по времени слота, от ранних к поздним; при равном времени порядок не меняется. */
export const bySlotStart = (a: MockAppointment, b: MockAppointment) => Date.parse(a.slot_start) - Date.parse(b.slot_start)

/** Дела по времени, при равном — по порядку создания. */
export const byDueAt = (a: MockReminder, b: MockReminder) => Date.parse(a.due_at) - Date.parse(b.due_at) || a.id - b.id

/** Прогресс курса по его делам; дела, удалённые при архивировании питомца, не считаются. */
export function courseProgress(state: MockServerState, prescriptionId: number) {
  const course = state.reminders.filter((item) => item.prescription_id === prescriptionId)
  const count = (status: ReminderStatus) => course.filter((item) => item.status === status).length
  return { total: course.length, done: count('done'), skipped: count('skipped'), pending: count('pending') }
}

/** Новые даты сверху; в один день — последняя добавленная (Р-45, Р-46). */
export const newestFirst = <T extends { id: number; date: string }>(a: T, b: T) =>
  a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1

/** Особенности питомца в порядке добавления; архивные не отдаются: возврата из архива в MVP нет (Р-44). */
export const activeConditions = (state: MockServerState, petId: number): Condition[] =>
  state.conditions.filter((item) => item.pet_id === petId && item.archived_at === null).sort((a, b) => a.id - b.id)

/** Прививки питомца, новые сверху. */
export const petVaccinations = (state: MockServerState, petId: number): Vaccination[] =>
  state.vaccinations.filter((item) => item.pet_id === petId).sort(newestFirst)

interface Period {
  from: string | null
  to: string | null
}

/** Период дневника из параметров date_from / date_to или готовый ответ 422 (Р-45); его же читает карточка клиники (Р-54). */
export function readPeriod(request: Request): Period | Response {
  const query = new URL(request.url).searchParams
  const from = query.get('date_from')
  const to = query.get('date_to')
  const fromError = from === null ? null : isoDateError(from, 'Начало периода')
  const toError = to === null ? null : isoDateError(to, 'Конец периода')
  // Порядок — только у двух верных дат.
  const outOfOrder = !fromError && !toError && from !== null && to !== null && from > to
  const invalid = fieldErrors('query', {
    date_from: fromError,
    date_to: toError ?? (outOfOrder ? 'Конец периода — не раньше начала' : null),
  })
  return invalid ?? { from, to }
}

/** Наблюдения питомца за период, границы включительно: новые даты сверху. */
export function observationsInPeriod(state: MockServerState, petId: number, { from, to }: Period): Observation[] {
  return state.observations
    .filter((item) => item.pet_id === petId && (from === null || item.date >= from) && (to === null || item.date <= to))
    .sort(newestFirst)
}
