import { http, HttpResponse } from 'msw'
import { appointmentLimits } from '../../api/limits'
import type { AppointmentStatus, ClinicAppointmentCancel, ClinicPetCard } from '../../api/schema'
import { moscowLocal } from '../../lib/dates'
import {
  activeConditions,
  authorizeClinic,
  canReadCard,
  clinicOf,
  findClinicAppointment,
  observationsInPeriod,
  petNotFound,
  petVaccinations,
  readPeriod,
} from '../access'
import { isoDateError } from '../date-validation'
import { conflict, notFound, queryError, readBody, validateBody } from '../http-utils'
import { notifyAppointment } from '../notify'
import { readServer, toAppointment, updateServer, type MockAppointment } from '../server-state'
import { normalizeText, textError } from '../text-validation'

const STATUSES: readonly AppointmentStatus[] = ['requested', 'confirmed', 'completed', 'cancelled']

const started = (appointment: MockAppointment, now: Date) => new Date(appointment.slot_start).getTime() <= now.getTime()
const isActive = (appointment: MockAppointment) => appointment.status === 'requested' || appointment.status === 'confirmed'

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
    const status = query.get('status')
    if (status !== null && !STATUSES.includes(status as AppointmentStatus)) {
      return queryError('status', 'Статус: requested, confirmed, completed или cancelled')
    }
    const from = query.get('date_from')
    const to = query.get('date_to')
    for (const [field, value] of [['date_from', from], ['date_to', to]] as const) {
      const error = value === null ? null : isoDateError(value, 'Дата')
      if (error) return queryError(field, error)
    }
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
      if (awaitingOutcome && !(item.status === 'confirmed' && started(item, now) && item.outcome === null)) return false
      // «Требуют решения»: активная будущая запись врача в отпуске или архиве (BR-05.7).
      if (requiresDecision && !(isActive(item) && !started(item, now) && unavailableVets.has(item.vet_id))) return false
      return true
    })
    return HttpResponse.json(
      list
        .sort((a, b) => new Date(a.slot_start).getTime() - new Date(b.slot_start).getTime())
        .map((item) => toAppointment(state, item)),
    )
  }),

  http.post('*/api/clinic/appointments/:id/confirm', ({ request, params }) =>
    updateServer((state) => {
      const clinicId = authorizeClinic(state, request)
      if (clinicId instanceof Response) return clinicId
      const appointment = findClinicAppointment(state, clinicId, params.id)
      if (!appointment) return notFound('Запись не найдена')
      if (appointment.status !== 'requested') return conflict('Подтвердить можно только заявку')
      // Прошедшую заявку клиника отменяет, а не подтверждает (Р-53).
      if (started(appointment, new Date())) return conflict('Время приёма уже прошло')
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
      if (!isActive(appointment)) return conflict('Запись уже завершена или отменена')
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
        .sort((a, b) => new Date(b.slot_start).getTime() - new Date(a.slot_start).getTime())
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
