import { http, HttpResponse } from 'msw'
import { healthLimits, outcomeLimits } from '../../api/limits'
import type {
  CareStatus,
  ClinicPetUpdate,
  Condition,
  ConditionCreate,
  OutcomeCreate,
  Prescription,
  Vaccination,
  WeightCreate,
} from '../../api/schema'
import { moscowLocal, toMoscowString } from '../../lib/dates'
import { careStatusLabel } from '../../lib/labels'
import { readBody, validateBody } from '../auth-validation'
import { pastDateError } from '../date-validation'
import { conditionKindError, conditionTitleError, multilineTextError, normalizeText, weightError } from '../health-validation'
import { notifyOutcome, notifyPetUpdated } from '../notify'
import { outcomeErrors, type FieldError } from '../outcome-validation'
import { birthDateError, breedError, normalizeBreed, sexError } from '../pet-validation'
import { addCourseReminders, newObservation, toAppointment, updateServer, type MockServerState } from '../server-state'
import { canReadCard, clinicOf, findOwnAppointment } from './clinic-appointments'
import { authorizeClinic } from './vets'

const invalid = (detail: FieldError[]) => HttpResponse.json({ detail }, { status: 422 })
const notFound = (detail: string) => HttpResponse.json({ detail }, { status: 404 })
const conflict = (detail: string) => HttpResponse.json({ detail }, { status: 409 })

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
 * Может ли клиника менять карточку (Р-57): нет связи с питомцем — 404, как у чтения карточки;
 * связь есть, но нет завершённого приёма — 403.
 */
function editAccess(state: MockServerState, clinicId: number, petId: number): Response | null {
  if (!canReadCard(state, clinicId, petId)) return notFound('Питомец не найден')
  const completed = state.appointments.some(
    (item) => item.pet_id === petId && item.status === 'completed' && clinicOf(state, item) === clinicId,
  )
  return completed ? null : HttpResponse.json({ detail: 'Нет завершённого приёма' }, { status: 403 })
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
      const fieldErrors = outcomeErrors(raw, null, now)
      if (fieldErrors.length > 0) return invalid(fieldErrors)
      const appointment = findOwnAppointment(state, clinicId, params.id)
      if (!appointment) return notFound('Запись не найдена')
      if (appointment.status === 'completed') return conflict('Итог уже внесён')
      if (appointment.status !== 'confirmed') return conflict('Итог вносится только у подтверждённой записи')
      if (new Date(appointment.slot_start).getTime() > now.getTime()) return conflict('Время приёма ещё не наступило')
      // Даты рецептов и прививок — относительно дня приёма, поэтому после поиска записи (Р-56).
      const day = moscowLocal(new Date(appointment.slot_start)).date
      const dateErrors = outcomeErrors(raw, day, now)
      if (dateErrors.length > 0) return invalid(dateErrors)

      const body = raw as OutcomeCreate
      const pet = state.pets.find((item) => item.id === appointment.pet_id)
      const clinic = state.clinics.find((item) => item.id === clinicId)
      if (!pet || !clinic) return notFound('Питомец не найден')
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
      const vaccinations: Vaccination[] = (body.vaccinations ?? []).map((item) => {
        const vaccination: Vaccination = {
          id: state.nextVaccinationId,
          pet_id: pet.id,
          name: item.name.trim(),
          date: item.date,
          next_date: item.next_date ?? null,
          source: 'clinic',
          appointment_id: appointment.id,
        }
        state.nextVaccinationId += 1
        state.vaccinations.push(vaccination)
        return vaccination
      })
      for (const item of body.conditions ?? []) {
        state.conditions.push({
          id: state.nextConditionId,
          pet_id: pet.id,
          kind: item.kind,
          title: item.title.trim(),
          description: normalizeText(item.description),
          source: 'clinic',
          archived_at: null,
        })
        state.nextConditionId += 1
      }

      // Данные питомца: что изменилось — в уведомление владельцу (БП §6.4).
      const changes: string[] = []
      const update = body.pet_update ?? {}
      if (update.weight !== undefined) {
        state.observations.push(
          newObservation({ id: state.nextObservationId, pet_id: pet.id, date: day, weight: update.weight, source: 'clinic' }),
        )
        state.nextObservationId += 1
        changes.push('вес')
      }
      if (update.breed !== undefined && normalizeBreed(update.breed) !== pet.breed) {
        pet.breed = normalizeBreed(update.breed)
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
      notifyOutcome(state, appointment, careStatusLabel[body.care_status as CareStatus], reminders)
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
      const sent = (field: string) => field in raw
      const bad = validateBody({
        breed: sent('breed') ? breedError(raw.breed) : null,
        birth_date: sent('birth_date') ? birthDateError(raw.birth_date) : null,
        sex: sent('sex') ? sexError(raw.sex) : null,
      })
      if (bad) return bad
      const petId = Number(params.petId)
      const denied = editAccess(state, clinicId, petId)
      if (denied) return denied
      const pet = state.pets.find((item) => item.id === petId)
      if (!pet) return notFound('Питомец не найден')
      const body = raw as ClinicPetUpdate
      const changes: string[] = []
      if (body.breed !== undefined && normalizeBreed(body.breed) !== pet.breed) {
        pet.breed = normalizeBreed(body.breed)
        changes.push('порода')
      }
      if (body.birth_date !== undefined && body.birth_date !== pet.birth_date) {
        pet.birth_date = body.birth_date
        changes.push('дата рождения')
      }
      if (body.sex !== undefined && body.sex !== pet.sex) {
        pet.sex = body.sex
        changes.push('пол')
      }
      notifyPetUpdated(state, pet.id, clinicId, changes)
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
      const petId = Number(params.petId)
      const denied = editAccess(state, clinicId, petId)
      if (denied) return denied
      const body = raw as WeightCreate
      const observation = newObservation({ id: state.nextObservationId, pet_id: petId, date: body.date, weight: body.weight, source: 'clinic' })
      state.nextObservationId += 1
      state.observations.push(observation)
      notifyPetUpdated(state, petId, clinicId, ['вес'])
      return HttpResponse.json(observation, { status: 201 })
    })
  }),

  http.post('*/api/clinic/pets/:petId/conditions', async ({ request, params }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const clinicId = authorizeClinic(state, request)
      if (clinicId instanceof Response) return clinicId
      const bad = validateBody({
        kind: conditionKindError(raw.kind),
        title: conditionTitleError(raw.title),
        description:
          'description' in raw ? multilineTextError(raw.description, 'Комментарий', healthLimits.conditionDescriptionMax) : null,
      })
      if (bad) return bad
      const petId = Number(params.petId)
      const denied = editAccess(state, clinicId, petId)
      if (denied) return denied
      const body = raw as ConditionCreate
      const condition: Condition = {
        id: state.nextConditionId,
        pet_id: petId,
        kind: body.kind,
        title: body.title.trim(),
        description: normalizeText(body.description),
        source: 'clinic',
        archived_at: null,
      }
      state.nextConditionId += 1
      state.conditions.push(condition)
      notifyPetUpdated(state, petId, clinicId, ['особенности здоровья'])
      return HttpResponse.json(condition, { status: 201 })
    })
  }),

  http.put('*/api/clinic/pets/:petId/photo', async ({ request, params }) => {
    const bytes = await multipartFile(request, 'file')
    return updateServer((state) => {
      const clinicId = authorizeClinic(state, request)
      if (clinicId instanceof Response) return clinicId
      if (!bytes) return invalid([{ loc: ['body', 'file'], msg: 'Выберите файл фото', type: 'value_error' }])
      if (bytes.length > outcomeLimits.photoBytesMax) {
        return HttpResponse.json({ detail: 'Фото больше 5 МБ' }, { status: 413 })
      }
      const type = photoType(bytes)
      if (!type) return HttpResponse.json({ detail: 'Фото — JPEG, PNG или WebP' }, { status: 415 })
      const petId = Number(params.petId)
      const denied = editAccess(state, clinicId, petId)
      if (denied) return denied
      const pet = state.pets.find((item) => item.id === petId)
      if (!pet) return notFound('Питомец не найден')
      // Бэкенд пережимает фото в WebP и отдаёт /media/<uuid>.webp; моки хранят файл как есть, в data:-адресе (Р-58).
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      pet.photo_url = `data:image/${type};base64,${btoa(binary)}`
      notifyPetUpdated(state, pet.id, clinicId, ['фото'])
      return HttpResponse.json({ photo_url: pet.photo_url })
    })
  }),
]
