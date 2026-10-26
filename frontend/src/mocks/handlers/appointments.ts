import { http, HttpResponse } from 'msw'
import { appointmentLimits } from '../../api/limits'
import type { AppointmentCreate, AppointmentReason, AppointmentStatus, Slot, Vet } from '../../api/schema'
import { addDays, isoWeekday, moscowDateTime, moscowLocal, toMoscowString } from '../../lib/dates'
import { moscowIsoDate } from '../../lib/format'
import { isoDateError } from '../date-validation'
import { authorizeAccount, conflict, notFound, queryError, readBody, validateBody } from '../http-utils'
import { notifyAppointment } from '../notify'
import {
  readServer,
  toAppointment,
  updateServer,
  type MockAppointment,
  type MockClinic,
  type MockServerState,
} from '../server-state'
import { multilineTextError, normalizeText } from '../text-validation'
import { findPet } from './pets'

const REASONS: readonly AppointmentReason[] = ['checkup', 'vaccination', 'illness', 'follow_up', 'other']
const STATUSES: readonly AppointmentStatus[] = ['requested', 'confirmed', 'completed', 'cancelled']
/** Записи, которые держат слот (БП §5: частичный индекс по «Заявка» и «Подтверждена»). */
const ACTIVE: readonly AppointmentStatus[] = ['requested', 'confirmed']
const SLOT_MS = appointmentLimits.slotMinutes * 60 * 1000
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

const collator = new Intl.Collator('ru')

/** Активная клиника: скрытую владелец не видит (Р-49). */
function activeClinic(state: MockServerState, rawId: unknown): MockClinic | undefined {
  const id = Number(rawId)
  return state.clinics.find((clinic) => clinic.id === id && clinic.archived_at === null)
}

/** Врач, к которому можно записаться: активен, не в отпуске, клиника не скрыта (БП §4). */
function bookableVet(state: MockServerState, rawId: unknown): { vet: Vet; clinic: MockClinic } | undefined {
  const id = typeof rawId === 'number' ? rawId : Number.NaN
  const vet = state.vets.find((item) => item.id === id && item.archived_at === null && !item.on_vacation)
  const clinic = vet && activeClinic(state, vet.clinic_id)
  return vet && clinic ? { vet, clinic } : undefined
}

/** Последний день окна записи: сегодня + 30 дней по Москве (Р-49). */
const lastBookableDay = (now: Date) => addDays(moscowIsoDate(now), appointmentLimits.daysAhead)

/** Начала слотов сетки клиники на дату: от opens_at до closes_at − 30 минут; в нерабочий день — пусто. */
function gridStarts(clinic: MockClinic, date: string): string[] {
  if (!clinic.work_days.includes(isoWeekday(date))) return []
  const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
  const starts: string[] = []
  for (let minute = toMinutes(clinic.opens_at); minute + appointmentLimits.slotMinutes <= toMinutes(clinic.closes_at); minute += 30) {
    const time = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
    starts.push(moscowDateTime(date, time))
  }
  return starts
}

/** Слот занят записью «Заявка» или «Подтверждена» этого врача. */
function isTaken(state: MockServerState, vetId: number, start: Date): boolean {
  return state.appointments.some(
    (item) => item.vet_id === vetId && ACTIVE.includes(item.status) && new Date(item.slot_start).getTime() === start.getTime(),
  )
}

const ownAppointment = (state: MockServerState, ownerId: number, rawId: unknown): MockAppointment | undefined => {
  const id = Number(rawId)
  const appointment = state.appointments.find((item) => item.id === id)
  const pet = appointment && state.pets.find((item) => item.id === appointment.pet_id)
  return pet?.owner_id === ownerId ? appointment : undefined
}

/** Ошибка slot_start: формат, сетка клиники врача, «ещё не наступило», окно 30 дней (Р-50). */
function slotStartError(value: unknown, clinic: MockClinic | undefined, now: Date): string | null {
  if (typeof value !== 'string' || !ISO_DATE_TIME.test(value) || Number.isNaN(Date.parse(value))) {
    return 'Время записи — дата и время со смещением'
  }
  // Сетку проверить не по чему: врач недоступен — ошибка уже у vet_id.
  if (!clinic) return null
  const start = new Date(value)
  const { date, time, seconds } = moscowLocal(start)
  if (seconds !== 0 || !gridStarts(clinic, date).includes(moscowDateTime(date, time))) return 'Время вне расписания клиники'
  if (start.getTime() <= now.getTime()) return 'Это время уже прошло'
  return date > lastBookableDay(now) ? `Запись — не дальше ${appointmentLimits.daysAhead} дней` : null
}

// Как у бэкенда: доступ (401/403), тело или параметры (422), поиск (404), конфликт (409).
export const appointmentHandlers = [
  http.get('*/api/clinics', ({ request }) => {
    const state = readServer()
    const account = authorizeAccount(state, request, { allowed: ['owner'] })
    if (account instanceof Response) return account
    return HttpResponse.json(
      state.clinics
        .filter((clinic) => clinic.archived_at === null)
        .sort((a, b) => collator.compare(a.name, b.name))
        // Clinic без полей админки: счётчика будущих записей и даты скрытия владелец не видит.
        .map(({ id, name, address, phone, opens_at, closes_at, work_days }) => ({
          id,
          name,
          address,
          phone,
          opens_at,
          closes_at,
          work_days,
        })),
    )
  }),

  http.get('*/api/clinics/:clinicId/vets', ({ request, params }) => {
    const state = readServer()
    const account = authorizeAccount(state, request, { allowed: ['owner'] })
    if (account instanceof Response) return account
    const clinic = activeClinic(state, params.clinicId)
    if (!clinic) return notFound('Клиника не найдена')
    return HttpResponse.json(
      state.vets
        .filter((vet) => vet.clinic_id === clinic.id && vet.archived_at === null && !vet.on_vacation)
        .sort((a, b) => collator.compare(a.full_name, b.full_name)),
    )
  }),

  http.get('*/api/clinics/:clinicId/vets/:vetId/slots', ({ request, params }) => {
    const state = readServer()
    const account = authorizeAccount(state, request, { allowed: ['owner'] })
    if (account instanceof Response) return account
    const now = new Date()
    // Без параметра — пустая строка: формат её не пропустит.
    const date = new URL(request.url).searchParams.get('date') ?? ''
    const today = moscowIsoDate(now)
    const dateError =
      isoDateError(date, 'Дата') ??
      (date < today
        ? 'Дата — не в прошлом'
        : date > lastBookableDay(now)
          ? `Дата — не дальше ${appointmentLimits.daysAhead} дней`
          : null)
    if (dateError) return queryError('date', dateError)
    const bookable = bookableVet(state, Number(params.vetId))
    if (!bookable || bookable.clinic.id !== Number(params.clinicId)) return notFound('Врач не принимает записи')
    const slots: Slot[] = gridStarts(bookable.clinic, date)
      .map((start) => new Date(start))
      .filter((start) => start.getTime() > now.getTime() && !isTaken(state, bookable.vet.id, start))
      .map((start) => ({ slot_start: toMoscowString(start), slot_end: toMoscowString(new Date(start.getTime() + SLOT_MS)) }))
    return HttpResponse.json(slots)
  }),

  http.post('*/api/appointments', async ({ request }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const account = authorizeAccount(state, request, { allowed: ['owner'] })
      if (account instanceof Response) return account
      const now = new Date()
      const found = typeof raw.pet_id === 'number' ? findPet(state, account.id, raw.pet_id) : undefined
      const pet = found?.archived_at === null ? found : undefined
      const bookable = bookableVet(state, raw.vet_id)
      const invalid = validateBody({
        // Ссылки в теле: чужой, архивный и несуществующий питомец — одно и то же 422 (Р-50).
        pet_id: pet ? null : 'Питомец не найден или в архиве',
        vet_id: bookable ? null : 'Врач недоступен для записи',
        slot_start: slotStartError(raw.slot_start, bookable?.clinic, now),
        reason: REASONS.includes(raw.reason as AppointmentReason) ? null : 'Выберите причину обращения',
        reason_comment:
          'reason_comment' in raw
            ? multilineTextError(raw.reason_comment, 'Комментарий', appointmentLimits.reasonCommentMax)
            : null,
      })
      if (invalid) return invalid
      // Без ошибок у pet_id и vet_id оба найдены — проверка только сужает тип.
      if (!pet || !bookable) throw new Error('pet_id и vet_id прошли проверку, но не найдены')
      const body = raw as AppointmentCreate
      const start = new Date(body.slot_start)
      if (isTaken(state, bookable.vet.id, start)) return conflict('Слот уже занят')
      const appointment: MockAppointment = {
        id: state.nextAppointmentId,
        pet_id: pet.id,
        vet_id: bookable.vet.id,
        slot_start: toMoscowString(start),
        reason: body.reason,
        reason_comment: normalizeText(body.reason_comment),
        status: 'requested',
        cancelled_by: null,
        clinic_comment: null,
        outcome: null,
      }
      state.nextAppointmentId += 1
      state.appointments.push(appointment)
      notifyAppointment(state, appointment, 'requested')
      return HttpResponse.json(toAppointment(state, appointment), { status: 201 })
    })
  }),

  http.get('*/api/appointments/:id', ({ request, params }) => {
    const state = readServer()
    const account = authorizeAccount(state, request, { allowed: ['owner'] })
    if (account instanceof Response) return account
    const appointment = ownAppointment(state, account.id, params.id)
    return appointment ? HttpResponse.json(toAppointment(state, appointment)) : notFound('Запись не найдена')
  }),

  http.post('*/api/appointments/:id/cancel', ({ request, params }) =>
    updateServer((state) => {
      const account = authorizeAccount(state, request, { allowed: ['owner'] })
      if (account instanceof Response) return account
      const appointment = ownAppointment(state, account.id, params.id)
      if (!appointment) return notFound('Запись не найдена')
      if (!ACTIVE.includes(appointment.status)) return conflict('Запись уже завершена или отменена')
      // До начала приёма (Р-48): в момент начала отменить уже нельзя.
      if (new Date(appointment.slot_start).getTime() <= Date.now()) return conflict('Приём уже начался')
      appointment.status = 'cancelled'
      appointment.cancelled_by = 'owner'
      notifyAppointment(state, appointment, 'cancelledByOwner')
      return HttpResponse.json(toAppointment(state, appointment))
    }),
  ),

  http.get('*/api/pets/:petId/appointments', ({ request, params }) => {
    const state = readServer()
    const account = authorizeAccount(state, request, { allowed: ['owner'] })
    if (account instanceof Response) return account
    const status = new URL(request.url).searchParams.get('status')
    if (status !== null && !STATUSES.includes(status as AppointmentStatus)) {
      return queryError('status', 'Статус: requested, confirmed, completed или cancelled')
    }
    // Архивный питомец — как обычно (Р-51).
    const pet = findPet(state, account.id, params.petId)
    if (!pet) return notFound('Питомец не найден')
    return HttpResponse.json(
      state.appointments
        .filter((item) => item.pet_id === pet.id && (status === null || item.status === status))
        .sort((a, b) => new Date(b.slot_start).getTime() - new Date(a.slot_start).getTime())
        .map((item) => toAppointment(state, item)),
    )
  }),
]
