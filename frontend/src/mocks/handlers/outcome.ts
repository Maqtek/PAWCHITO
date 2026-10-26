import { http, HttpResponse } from 'msw'
import { outcomeLimits } from '../../api/limits'
import type { ClinicPetUpdate, ConditionCreate, OutcomeCreate, Pet, Prescription, WeightCreate } from '../../api/schema'
import { moscowLocal, toMoscowString } from '../../lib/dates'
import { careStatusLabel } from '../../lib/labels'
import { authorizeClinic, canReadCard, clinicOf, findClinicAppointment, petNotFound } from '../access'
import { pastDateError } from '../date-validation'
import { conditionChecks, weightError } from '../health-validation'
import { conflict, fieldError, forbidden, notFound, readBody, unprocessable, validateBody } from '../http-utils'
import { notifyOutcome, notifyPetUpdated } from '../notify'
import { outcomeErrors } from '../outcome-validation'
import { clinicPetChecks } from '../pet-validation'
import {
  addCondition,
  addCourseReminders,
  addObservation,
  addVaccination,
  toAppointment,
  updateServer,
  type MockServerState,
} from '../server-state'
import { normalizeText } from '../text-validation'

/** Первые байты файла: тип фото определяется по содержимому, а не по имени (Р-58). */
function photoType(bytes: Uint8Array): 'jpeg' | 'png' | 'webp' | null {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value)
  if (starts(0xff, 0xd8, 0xff)) return 'jpeg'
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png'
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to))
  return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' ? 'webp' : null
}

/**
 * Байты файла из multipart/form-data. Разбираем сами, а не request.formData(): в тестах разбор из Node создаёт File,
 * а класс File там из jsdom — разбор падает на собственной проверке. Браузер присылает такой же multipart.
 */
async function multipartFile(request: Request, field: string): Promise<Uint8Array | null> {
  const match = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(request.headers.get('Content-Type') ?? '')
  if (!match) return null
  const body = new Uint8Array(await request.arrayBuffer())
  // windows-1252 переводит каждый байт ровно в один символ: позиции в строке — это позиции байтов.
  const text = new TextDecoder('windows-1252').decode(body)
  const delimiter = `--${match[1] ?? match[2]}`
  for (let start = text.indexOf(delimiter); start !== -1; ) {
    const next = text.indexOf(delimiter, start + delimiter.length)
    if (next === -1) break
    const headersEnd = text.indexOf('\r\n\r\n', start)
    if (headersEnd !== -1 && headersEnd < next && text.slice(start, headersEnd).includes(`name="${field}"`)) {
      // Перед следующим разделителем — перевод строки, он не часть файла.
      return body.slice(headersEnd + 4, next - 2)
    }
    start = next
  }
  return null
}

/**
 * Питомец, карточку которого клиника может менять (Р-57), или готовый ответ: нет связи с питомцем — 404, как у чтения
 * карточки; связь есть, но нет завершённого приёма — 403.
 */
function editablePet(state: MockServerState, clinicId: number, rawId: unknown): Pet | Response {
  const petId = Number(rawId)
  if (!canReadCard(state, clinicId, petId)) return petNotFound()
  const completed = state.appointments.some(
    (item) => item.pet_id === petId && item.status === 'completed' && clinicOf(state, item) === clinicId,
  )
  if (!completed) return forbidden('Нет завершённого приёма')
  return state.pets.find((item) => item.id === petId) ?? petNotFound()
}

/** Порода, дата рождения и пол от клиники; возвращает, что действительно изменилось, — для уведомления владельцу. */
function applyClinicPetUpdate(pet: Pet, update: ClinicPetUpdate): string[] {
  const changes: string[] = []
  if (update.breed !== undefined && normalizeText(update.breed) !== pet.breed) {
    pet.breed = normalizeText(update.breed)
    changes.push('порода')
  }
  if (update.birth_date !== undefined && update.birth_date !== pet.birth_date) {
    pet.birth_date = update.birth_date
    changes.push('дата рождения')
  }
  if (update.sex !== undefined && update.sex !== pet.sex) {
    pet.sex = update.sex
    changes.push('пол')
  }
  return changes
}

const sorted = (times: string[]) => [...times].sort()

// Как у бэкенда: доступ (401/403), тело (422), поиск (404), статус (409).
export const outcomeHandlers = [
  http.post('*/api/clinic/appointments/:id/outcome', async ({ request, params }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const clinicId = authorizeClinic(state, request)
      if (clinicId instanceof Response) return clinicId
      const now = new Date()
      const errors = outcomeErrors(raw, null, now)
      if (errors.length > 0) return unprocessable(errors)
      const appointment = findClinicAppointment(state, clinicId, params.id)
      if (!appointment) return notFound('Запись не найдена')
      if (appointment.status === 'completed') return conflict('Итог уже внесён')
      if (appointment.status !== 'confirmed') return conflict('Итог вносится только у подтверждённой записи')
      if (new Date(appointment.slot_start).getTime() > now.getTime()) return conflict('Время приёма ещё не наступило')
      // Даты рецептов и прививок — относительно дня приёма, поэтому после поиска записи (Р-56).
      const day = moscowLocal(new Date(appointment.slot_start)).date
      const dateErrors = outcomeErrors(raw, day, now)
      if (dateErrors.length > 0) return unprocessable(dateErrors)

      const body = raw as OutcomeCreate
      const pet = state.pets.find((item) => item.id === appointment.pet_id)
      const clinic = state.clinics.find((item) => item.id === clinicId)
      if (!pet || !clinic) return petNotFound()
      const completedAt = toMoscowString(now)

      const prescriptions: Prescription[] = (body.prescriptions ?? []).map((item) => {
        const prescription: Prescription = {
          id: state.nextPrescriptionId,
          drug: item.drug.trim(),
          dosage: item.dosage.trim(),
          times: sorted(item.times),
          duration_days: item.duration_days,
          start_date: item.start_date ?? day,
        }
        state.nextPrescriptionId += 1
        return prescription
      })
      const vaccinations = (body.vaccinations ?? []).map((item) =>
        addVaccination(state, { ...item, pet_id: pet.id, source: 'clinic', appointment_id: appointment.id }),
      )
      for (const item of body.conditions ?? []) addCondition(state, { ...item, pet_id: pet.id, source: 'clinic' })

      // Данные питомца: что изменилось — в уведомление владельцу (БП §6.4).
      const changes: string[] = []
      const update = body.pet_update ?? {}
      if (update.weight !== undefined) {
        addObservation(state, { pet_id: pet.id, date: day, weight: update.weight, source: 'clinic' })
        changes.push('вес')
      }
      changes.push(...applyClinicPetUpdate(pet, update))
      if ((body.conditions ?? []).length > 0) changes.push('особенности здоровья')

      // Статус ухода — из итога, с датой и клиникой (БП §6.3).
      pet.care_status = body.care_status
      pet.care_status_set_at = completedAt
      pet.care_status_clinic = { id: clinic.id, name: clinic.name }

      appointment.status = 'completed'
      appointment.outcome = {
        conclusion: body.conclusion.trim(),
        recommendations: normalizeText(body.recommendations),
        care_status: body.care_status,
        completed_at: completedAt,
        prescriptions,
        vaccinations,
      }
      // Дела курса — каждое время каждого дня, кроме уже прошедшего (БП §6.2).
      const reminders = prescriptions.reduce((sum, prescription) => sum + addCourseReminders(state, pet.id, prescription, now), 0)
      notifyOutcome(state, appointment, careStatusLabel[body.care_status], reminders)
      notifyPetUpdated(state, pet.id, clinicId, changes)
      return HttpResponse.json({ appointment: toAppointment(state, appointment), created_reminders: reminders })
    })
  }),

  http.patch('*/api/clinic/pets/:petId', async ({ request, params }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const clinicId = authorizeClinic(state, request)
      if (clinicId instanceof Response) return clinicId
      // Только порода, дата рождения и пол; кличку, вид, фото и статус ухода сервер игнорирует (Р-57).
      const bad = validateBody(clinicPetChecks(raw))
      if (bad) return bad
      const pet = editablePet(state, clinicId, params.petId)
      if (pet instanceof Response) return pet
      notifyPetUpdated(state, pet.id, clinicId, applyClinicPetUpdate(pet, raw as ClinicPetUpdate))
      return HttpResponse.json(pet)
    })
  }),

  http.post('*/api/clinic/pets/:petId/weight', async ({ request, params }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const clinicId = authorizeClinic(state, request)
      if (clinicId instanceof Response) return clinicId
      const bad = validateBody({
        date: pastDateError(raw.date, 'Дата'),
        weight: raw.weight === null || raw.weight === undefined ? 'Укажите вес' : weightError(raw.weight),
      })
      if (bad) return bad
      const pet = editablePet(state, clinicId, params.petId)
      if (pet instanceof Response) return pet
      const body = raw as WeightCreate
      const observation = addObservation(state, { pet_id: pet.id, date: body.date, weight: body.weight, source: 'clinic' })
      notifyPetUpdated(state, pet.id, clinicId, ['вес'])
      return HttpResponse.json(observation, { status: 201 })
    })
  }),

  http.post('*/api/clinic/pets/:petId/conditions', async ({ request, params }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const clinicId = authorizeClinic(state, request)
      if (clinicId instanceof Response) return clinicId
      const bad = validateBody(conditionChecks(raw, { creating: true }))
      if (bad) return bad
      const pet = editablePet(state, clinicId, params.petId)
      if (pet instanceof Response) return pet
      const condition = addCondition(state, { ...(raw as ConditionCreate), pet_id: pet.id, source: 'clinic' })
      notifyPetUpdated(state, pet.id, clinicId, ['особенности здоровья'])
      return HttpResponse.json(condition, { status: 201 })
    })
  }),

  http.put('*/api/clinic/pets/:petId/photo', async ({ request, params }) => {
    const bytes = await multipartFile(request, 'file')
    return updateServer((state) => {
      const clinicId = authorizeClinic(state, request)
      if (clinicId instanceof Response) return clinicId
      if (!bytes) return unprocessable([fieldError(['body', 'file'], 'Выберите файл фото')])
      if (bytes.length > outcomeLimits.photoBytesMax) {
        return HttpResponse.json({ detail: 'Фото больше 5 МБ' }, { status: 413 })
      }
      const type = photoType(bytes)
      if (!type) return HttpResponse.json({ detail: 'Фото — JPEG, PNG или WebP' }, { status: 415 })
      const pet = editablePet(state, clinicId, params.petId)
      if (pet instanceof Response) return pet
      // Бэкенд пережимает фото в WebP и отдаёт /media/<uuid>.webp; моки хранят файл как есть, в data:-адресе (Р-58).
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      pet.photo_url = `data:image/${type};base64,${btoa(binary)}`
      notifyPetUpdated(state, pet.id, clinicId, ['фото'])
      return HttpResponse.json({ photo_url: pet.photo_url })
    })
  }),
]
