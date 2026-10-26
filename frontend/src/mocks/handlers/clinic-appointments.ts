import { http, HttpResponse } from 'msw'
import { appointmentLimits } from '../../api/limits'
import type { ClinicAppointmentCancel, ClinicPetCard } from '../../api/schema'
import { moscowLocal } from '../../lib/dates'
import {
  activeConditions,
  APPOINTMENT_STATUSES,
  authorizeClinic,
  bySlotStart,
  canReadCard,
  clinicOf,
  findClinicAppointment,
  observationsInPeriod,
  petNotFound,
  petVaccinations,
  readPeriod,
} from '../access'
import { conflict, notFound, queryError, readBody, readDateRange, readStatus, validateBody } from '../http-utils'
import { notifyAppointment } from '../notify'
import { hasStarted, isActiveAppointment, readServer, toAppointment, updateServer } from '../server-state'
import { normalizeText, textError } from '../text-validation'

/** Флаг из параметра: только true или false, иначе 422 (Р-52). */
function readFlag(query: URLSearchParams, name: string): boolean | Response {
  const value = query.get(name)
  if (value === null || value === 'false') return false
  return value === 'true' ? true : queryError(name, `${name}: true или false`)
}

/** Комментарий клиники владельцу: обязателен, 1–500 символов, переводы строк разрешены (Р-53). */
function commentError(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() === '') return 'Напишите владельцу, почему запись отменена'
  return textError(value, 'Комментарий', appointmentLimits.reasonCommentMax, { multiline: true })
}

// Как у бэкенда: доступ (401/403), тело или параметры (422), поиск (404), статус (409).
export const clinicAppointmentHandlers = [
  http.get('*/api/clinic/appointments', ({ request }) => {
    const state = readServer()
    const clinicId = authorizeClinic(state, request)
    if (clinicId instanceof Response) return clinicId
    const query = new URL(request.url).searchParams
    const status = readStatus(query, APPOINTMENT_STATUSES)
    if (status instanceof Response) return status
    const period = readDateRange(query)
    if (period instanceof Response) return period
    const { from, to } = period
    const rawVet = query.get('vet_id')
    const vetId = rawVet === null ? null : Number(rawVet)
    // Архивный врач своей клиники — тоже фильтр: его записи нужны в истории (Р-52).
    if (vetId !== null && !state.vets.some((vet) => vet.id === vetId && vet.clinic_id === clinicId)) {
      return queryError('vet_id', 'Врач не из вашей клиники')
    }
    const awaitingOutcome = readFlag(query, 'awaiting_outcome')
    if (awaitingOutcome instanceof Response) return awaitingOutcome
    const requiresDecision = readFlag(query, 'requires_decision')
    if (requiresDecision instanceof Response) return requiresDecision

    const now = new Date()
    const unavailableVets = new Set(
      state.vets.filter((vet) => vet.clinic_id === clinicId && (vet.on_vacation || vet.archived_at !== null)).map((vet) => vet.id),
    )
    const list = state.appointments.filter((item) => {
      if (clinicOf(state, item) !== clinicId) return false
      const day = moscowLocal(new Date(item.slot_start)).date
      if (status !== null && item.status !== status) return false
      if ((from !== null && day < from) || (to !== null && day > to)) return false
      if (vetId !== null && item.vet_id !== vetId) return false
      // «Ждут итога»: подтверждена, время наступило, итога нет (БП §5).
      if (awaitingOutcome && !(item.status === 'confirmed' && hasStarted(item, now) && item.outcome === null)) return false
      // «Требуют решения»: активная будущая запись врача в отпуске или архиве (BR-05.7).
      if (requiresDecision && !(isActiveAppointment(item) && !hasStarted(item, now) && unavailableVets.has(item.vet_id))) {
        return false
      }
      return true
    })
    return HttpResponse.json(list.sort(bySlotStart).map((item) => toAppointment(state, item)))
  }),

  http.post('*/api/clinic/appointments/:id/confirm', ({ request, params }) =>
    updateServer((state) => {
      const clinicId = authorizeClinic(state, request)
      if (clinicId instanceof Response) return clinicId
      const appointment = findClinicAppointment(state, clinicId, params.id)
      if (!appointment) return notFound('Запись не найдена')
      if (appointment.status !== 'requested') return conflict('Подтвердить можно только заявку')
      // Прошедшую заявку клиника отменяет, а не подтверждает (Р-53).
      if (hasStarted(appointment)) return conflict('Время приёма уже прошло')
      appointment.status = 'confirmed'
      notifyAppointment(state, appointment, 'confirmed')
      return HttpResponse.json(toAppointment(state, appointment))
    }),
  ),

  http.post('*/api/clinic/appointments/:id/cancel', async ({ request, params }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const clinicId = authorizeClinic(state, request)
      if (clinicId instanceof Response) return clinicId
      const invalid = validateBody({ comment: commentError(raw.comment) })
      if (invalid) return invalid
      const appointment = findClinicAppointment(state, clinicId, params.id)
      if (!appointment) return notFound('Запись не найдена')
      // В том числе прошедшую: так клиника закрывает неявку (Р-53).
      if (!isActiveAppointment(appointment)) return conflict('Запись уже завершена или отменена')
      appointment.status = 'cancelled'
      appointment.cancelled_by = 'clinic'
      appointment.clinic_comment = normalizeText((raw as ClinicAppointmentCancel).comment)
      notifyAppointment(state, appointment, 'cancelledByClinic')
      return HttpResponse.json(toAppointment(state, appointment))
    })
  }),

  http.get('*/api/clinic/pets/:petId', ({ request, params }) => {
    const state = readServer()
    const clinicId = authorizeClinic(state, request)
    if (clinicId instanceof Response) return clinicId
    const pet = state.pets.find((item) => item.id === Number(params.petId))
    if (!pet || !canReadCard(state, clinicId, pet.id)) return petNotFound()
    const card: ClinicPetCard = {
      pet,
      conditions: activeConditions(state, pet.id),
      vaccinations: petVaccinations(state, pet.id),
      appointments: state.appointments
        .filter((item) => item.pet_id === pet.id && clinicOf(state, item) === clinicId)
        // Новые сверху.
        .sort((a, b) => bySlotStart(b, a))
        .map((item) => toAppointment(state, item)),
    }
    return HttpResponse.json(card)
  }),

  http.get('*/api/clinic/pets/:petId/observations', ({ request, params }) => {
    const state = readServer()
    const clinicId = authorizeClinic(state, request)
    if (clinicId instanceof Response) return clinicId
    const period = readPeriod(request)
    if (period instanceof Response) return period
    const petId = Number(params.petId)
    if (!canReadCard(state, clinicId, petId)) return petNotFound()
    return HttpResponse.json(observationsInPeriod(state, petId, period))
  }),
]
