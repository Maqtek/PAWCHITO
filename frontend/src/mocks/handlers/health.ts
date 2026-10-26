import { http, HttpResponse } from 'msw'
import { healthLimits } from '../../api/limits'
import type {
  Condition,
  ConditionCreate,
  ConditionUpdate,
  Observation,
  ObservationCreate,
  ObservationUpdate,
  Vaccination,
  VaccinationCreate,
  VaccinationUpdate,
} from '../../api/schema'
import { readBody, validateBody } from '../auth-validation'
import { isoDateError, pastDateError } from '../date-validation'
import {
  conditionKindError,
  conditionTitleError,
  levelError,
  multilineTextError,
  normalizeText,
  vaccineNameError,
  weightError,
} from '../health-validation'
import { authorizeAccount, forbidden } from '../http-utils'
import { newObservation, readServer, updateServer, type MockServerState } from '../server-state'
import { findPet } from './pets'

const notFound = () => HttpResponse.json({ detail: 'Запись не найдена' }, { status: 404 })
const petNotFound = () => HttpResponse.json({ detail: 'Питомец не найден' }, { status: 404 })
const fromClinic = () => forbidden('Запись внесена клиникой — изменить её может только клиника')

/** 422 без поля: правило про всё тело, как model_validator у Pydantic (Р-45). */
const nothingFilled = () =>
  HttpResponse.json(
    { detail: [{ loc: ['body'], msg: 'Заполните хотя бы одно поле, кроме даты', type: 'value_error' }] },
    { status: 422 },
  )

const OBSERVATION_FIELDS = ['weight', 'appetite', 'energy', 'symptoms', 'note'] as const

/** Хотя бы одно поле наблюдения, кроме даты; пустой после обрезки текст не считается. */
function hasObservationData(values: Partial<Record<(typeof OBSERVATION_FIELDS)[number], unknown>>): boolean {
  return OBSERVATION_FIELDS.some((field) => {
    const value = values[field]
    return typeof value === 'string' ? value.trim() !== '' : value !== null && value !== undefined
  })
}

/** Владелец из access-токена или готовый ответ 401/403. */
function authorizeOwner(state: MockServerState, request: Request) {
  return authorizeAccount(state, request, { allowed: ['owner'] })
}

/** Запись этого питомца; запись другого питомца — как несуществующая, 404 (Р-47). */
function findRecord<T extends { id: number; pet_id: number }>(list: T[], petId: number, rawId: unknown): T | undefined {
  const id = Number(rawId)
  return list.find((item) => item.id === id && item.pet_id === petId)
}

const sent = (raw: Record<string, unknown>, field: string) => field in raw

/** Новые даты сверху; в один день — последняя добавленная (Р-45, Р-46). */
export const newestFirst = <T extends { id: number; date: string }>(a: T, b: T) =>
  a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1

// Как у бэкенда: доступ (401/403), тело (422), поиск питомца и записи (404), источник записи (403).
export const healthHandlers = [
  // Особенности здоровья
  http.get('*/api/pets/:petId/conditions', ({ request, params }) => {
    const state = readServer()
    const account = authorizeOwner(state, request)
    if (account instanceof Response) return account
    const pet = findPet(state, account.id, params.petId)
    if (!pet) return petNotFound()
    // Архивные не отдаются: возврата из архива в MVP нет (Р-44).
    return HttpResponse.json(
      state.conditions.filter((item) => item.pet_id === pet.id && item.archived_at === null).sort((a, b) => a.id - b.id),
    )
  }),

  http.post('*/api/pets/:petId/conditions', async ({ request, params }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const account = authorizeOwner(state, request)
      if (account instanceof Response) return account
      const invalid = validateBody({
        kind: conditionKindError(raw.kind),
        title: conditionTitleError(raw.title),
        description: sent(raw, 'description')
          ? multilineTextError(raw.description, 'Комментарий', healthLimits.conditionDescriptionMax)
          : null,
      })
      if (invalid) return invalid
      const pet = findPet(state, account.id, params.petId)
      if (!pet) return petNotFound()
      const body = raw as ConditionCreate
      const condition: Condition = {
        id: state.nextConditionId,
        pet_id: pet.id,
        kind: body.kind,
        title: body.title.trim(),
        description: normalizeText(body.description),
        source: 'owner',
        archived_at: null,
      }
      state.nextConditionId += 1
      state.conditions.push(condition)
      return HttpResponse.json(condition, { status: 201 })
    })
  }),

  http.patch('*/api/pets/:petId/conditions/:id', async ({ request, params }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const account = authorizeOwner(state, request)
      if (account instanceof Response) return account
      const invalid = validateBody({
        kind: sent(raw, 'kind') ? conditionKindError(raw.kind) : null,
        title: sent(raw, 'title') ? conditionTitleError(raw.title) : null,
        description: sent(raw, 'description')
          ? multilineTextError(raw.description, 'Комментарий', healthLimits.conditionDescriptionMax)
          : null,
      })
      if (invalid) return invalid
      const pet = findPet(state, account.id, params.petId)
      if (!pet) return petNotFound()
      const condition = findRecord(state.conditions, pet.id, params.id)
      if (!condition) return notFound()
      if (condition.source === 'clinic') return fromClinic()
      const body = raw as ConditionUpdate
      if (body.kind !== undefined) condition.kind = body.kind
      if (body.title !== undefined) condition.title = body.title.trim()
      if (body.description !== undefined) condition.description = normalizeText(body.description)
      return HttpResponse.json(condition)
    })
  }),

  http.post('*/api/pets/:petId/conditions/:id/archive', ({ request, params }) =>
    updateServer((state) => {
      const account = authorizeOwner(state, request)
      if (account instanceof Response) return account
      const pet = findPet(state, account.id, params.petId)
      if (!pet) return petNotFound()
      const condition = findRecord(state.conditions, pet.id, params.id)
      if (!condition) return notFound()
      if (condition.source === 'clinic') return fromClinic()
      // Повторное архивирование ничего не меняет (Р-47).
      condition.archived_at ??= new Date().toISOString()
      return HttpResponse.json(condition)
    }),
  ),

  // Дневник
  http.get('*/api/pets/:petId/observations', ({ request, params }) => {
    const state = readServer()
    const account = authorizeOwner(state, request)
    if (account instanceof Response) return account
    const period = readPeriod(request)
    if (period instanceof Response) return period
    const pet = findPet(state, account.id, params.petId)
    if (!pet) return petNotFound()
    return HttpResponse.json(observationsInPeriod(state, pet.id, period))
  }),

  http.post('*/api/pets/:petId/observations', async ({ request, params }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const account = authorizeOwner(state, request)
      if (account instanceof Response) return account
      const invalid = validateBody(observationChecks(raw, { creating: true }))
      if (invalid) return invalid
      if (!hasObservationData(raw)) return nothingFilled()
      const pet = findPet(state, account.id, params.petId)
      if (!pet) return petNotFound()
      const body = raw as ObservationCreate
      const observation = newObservation({
        id: state.nextObservationId,
        pet_id: pet.id,
        date: body.date,
        weight: body.weight ?? null,
        appetite: body.appetite ?? null,
        energy: body.energy ?? null,
        symptoms: normalizeText(body.symptoms),
        note: normalizeText(body.note),
        source: 'owner',
      })
      state.nextObservationId += 1
      state.observations.push(observation)
      return HttpResponse.json(observation, { status: 201 })
    })
  }),

  http.patch('*/api/pets/:petId/observations/:id', async ({ request, params }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const account = authorizeOwner(state, request)
      if (account instanceof Response) return account
      const invalid = validateBody(observationChecks(raw, { creating: false }))
      if (invalid) return invalid
      const pet = findPet(state, account.id, params.petId)
      if (!pet) return petNotFound()
      const observation = findRecord(state.observations, pet.id, params.id)
      if (!observation) return notFound()
      if (observation.source === 'clinic') return fromClinic()
      const body = raw as ObservationUpdate
      const next: Observation = {
        ...observation,
        ...(body.date !== undefined && { date: body.date }),
        ...(body.weight !== undefined && { weight: body.weight }),
        ...(body.appetite !== undefined && { appetite: body.appetite }),
        ...(body.energy !== undefined && { energy: body.energy }),
        ...(body.symptoms !== undefined && { symptoms: normalizeText(body.symptoms) }),
        ...(body.note !== undefined && { note: normalizeText(body.note) }),
      }
      // «Хотя бы одно поле» — по итоговым значениям: правка не может опустошить наблюдение (Р-43).
      if (!hasObservationData(next)) return nothingFilled()
      Object.assign(observation, next)
      return HttpResponse.json(observation)
    })
  }),

  // Прививки
  http.get('*/api/pets/:petId/vaccinations', ({ request, params }) => {
    const state = readServer()
    const account = authorizeOwner(state, request)
    if (account instanceof Response) return account
    const pet = findPet(state, account.id, params.petId)
    if (!pet) return petNotFound()
    return HttpResponse.json(state.vaccinations.filter((item) => item.pet_id === pet.id).sort(newestFirst))
  }),

  http.post('*/api/pets/:petId/vaccinations', async ({ request, params }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const account = authorizeOwner(state, request)
      if (account instanceof Response) return account
      const nextDate = sent(raw, 'next_date') && raw.next_date !== null ? isoDateError(raw.next_date, 'Следующая прививка') : null
      const invalid = validateBody({
        name: vaccineNameError(raw.name),
        date: pastDateError(raw.date, 'Дата прививки'),
        next_date: nextDate ?? nextDateOrderError(raw.date, raw.next_date),
      })
      if (invalid) return invalid
      const pet = findPet(state, account.id, params.petId)
      if (!pet) return petNotFound()
      const body = raw as VaccinationCreate
      const vaccination: Vaccination = {
        id: state.nextVaccinationId,
        pet_id: pet.id,
        name: body.name.trim(),
        date: body.date,
        next_date: body.next_date ?? null,
        source: 'owner',
        appointment_id: null,
      }
      state.nextVaccinationId += 1
      state.vaccinations.push(vaccination)
      return HttpResponse.json(vaccination, { status: 201 })
    })
  }),

  http.patch('*/api/pets/:petId/vaccinations/:id', async ({ request, params }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const account = authorizeOwner(state, request)
      if (account instanceof Response) return account
      const invalid = validateBody({
        name: sent(raw, 'name') ? vaccineNameError(raw.name) : null,
        date: sent(raw, 'date') ? pastDateError(raw.date, 'Дата прививки') : null,
        next_date: sent(raw, 'next_date') && raw.next_date !== null ? isoDateError(raw.next_date, 'Следующая прививка') : null,
      })
      if (invalid) return invalid
      const pet = findPet(state, account.id, params.petId)
      if (!pet) return petNotFound()
      const vaccination = findRecord(state.vaccinations, pet.id, params.id)
      if (!vaccination) return notFound()
      if (vaccination.source === 'clinic') return fromClinic()
      const body = raw as VaccinationUpdate
      const date = body.date ?? vaccination.date
      const nextDate = body.next_date !== undefined ? body.next_date : vaccination.next_date
      // Порядок дат — по итоговым значениям, после поиска прививки, как часы клиники (Р-36, Р-46).
      const order = validateBody({ next_date: nextDateOrderError(date, nextDate) })
      if (order) return order
      if (body.name !== undefined) vaccination.name = body.name.trim()
      vaccination.date = date
      vaccination.next_date = nextDate
      return HttpResponse.json(vaccination)
    })
  }),

  http.delete('*/api/pets/:petId/vaccinations/:id', ({ request, params }) =>
    updateServer((state) => {
      const account = authorizeOwner(state, request)
      if (account instanceof Response) return account
      const pet = findPet(state, account.id, params.petId)
      if (!pet) return petNotFound()
      const vaccination = findRecord(state.vaccinations, pet.id, params.id)
      // Повторное удаление — 404: прививки уже нет (Р-47).
      if (!vaccination) return notFound()
      if (vaccination.source === 'clinic') return fromClinic()
      state.vaccinations = state.vaccinations.filter((item) => item !== vaccination)
      return new HttpResponse(null, { status: 204 })
    }),
  ),
]

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
  const orderError = !fromError && !toError && from !== null && to !== null && from > to
  const detail = [
    fromError && { field: 'date_from', msg: fromError },
    (toError ?? orderError) && { field: 'date_to', msg: toError ?? 'Конец периода — не раньше начала' },
  ].filter((item): item is { field: string; msg: string } => typeof item === 'object' && item !== null)
  if (detail.length === 0) return { from, to }
  // Ошибка параметра запроса — в loc ["query", …], как у FastAPI.
  return HttpResponse.json(
    { detail: detail.map(({ field, msg }) => ({ loc: ['query', field], msg, type: 'value_error' })) },
    { status: 422 },
  )
}

/** Наблюдения питомца за период, границы включительно: новые даты сверху. */
export function observationsInPeriod(state: MockServerState, petId: number, { from, to }: Period): Observation[] {
  return state.observations
    .filter((item) => item.pet_id === petId && (from === null || item.date >= from) && (to === null || item.date <= to))
    .sort(newestFirst)
}

/** Проверки полей наблюдения: в POST дата обязательна, в PATCH — только присланные поля, null в дате — 422. */
function observationChecks(raw: Record<string, unknown>, { creating }: { creating: boolean }) {
  return {
    date: creating || sent(raw, 'date') ? pastDateError(raw.date, 'Дата') : null,
    weight: sent(raw, 'weight') ? weightError(raw.weight) : null,
    appetite: sent(raw, 'appetite') ? levelError(raw.appetite, 'Аппетит') : null,
    energy: sent(raw, 'energy') ? levelError(raw.energy, 'Энергия') : null,
    symptoms: sent(raw, 'symptoms') ? multilineTextError(raw.symptoms, 'Симптомы', healthLimits.symptomsMax) : null,
    note: sent(raw, 'note') ? multilineTextError(raw.note, 'Заметка', healthLimits.noteMax) : null,
  }
}

/** Следующая прививка — строго позже даты прививки (Р-46); без следующей или с неверной датой — не проверяется. */
function nextDateOrderError(date: unknown, nextDate: unknown): string | null {
  if (typeof date !== 'string' || typeof nextDate !== 'string') return null
  return nextDate > date ? null : 'Следующая прививка — позже даты прививки'
}
