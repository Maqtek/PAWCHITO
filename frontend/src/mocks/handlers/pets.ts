import { http, HttpResponse } from 'msw'
import type { Pet, PetCreate, PetUpdate } from '../../api/schema'
import { readBody, validateBody } from '../auth-validation'
import { authorizeAccount } from '../http-utils'
import { birthDateError, breedError, normalizeBreed, petNameError, sexError, speciesError } from '../pet-validation'
import { newPet, readServer, updateServer, type MockServerState } from '../server-state'

const notFound = () => HttpResponse.json({ detail: 'Питомец не найден' }, { status: 404 })

/** Питомец владельца; питомец другого владельца — как несуществующий, 404 (Р-42). Архивный находится как обычно. */
export function findPet(state: MockServerState, ownerId: number, rawId: unknown): Pet | undefined {
  const id = Number(rawId)
  return state.pets.find((pet) => pet.id === id && pet.owner_id === ownerId)
}

// Как у бэкенда: сначала доступ, потом тело (422), потом поиск питомца (404).
export const petHandlers = [
  http.get('*/api/pets', ({ request }) => {
    const state = readServer()
    const account = authorizeAccount(state, request, { allowed: ['owner'] })
    if (account instanceof Response) return account
    // archived=true — расширенная версия (Р-40); фронт MVP его не запрашивает.
    const archived = new URL(request.url).searchParams.get('archived') === 'true'
    return HttpResponse.json(
      state.pets
        .filter((pet) => pet.owner_id === account.id && (pet.archived_at !== null) === archived)
        // В порядке добавления: первый выбран в переключателе по умолчанию (Р-42).
        .sort((a, b) => a.id - b.id),
    )
  }),

  http.post('*/api/pets', async ({ request }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const account = authorizeAccount(state, request, { allowed: ['owner'] })
      if (account instanceof Response) return account
      const sent = (field: string) => field in raw
      const invalid = validateBody({
        name: petNameError(raw.name),
        species: speciesError(raw.species),
        breed: sent('breed') ? breedError(raw.breed) : null,
        birth_date: sent('birth_date') ? birthDateError(raw.birth_date) : null,
        sex: sent('sex') ? sexError(raw.sex) : null,
      })
      if (invalid) return invalid
      const body = raw as PetCreate
      // Фото и статус ухода из тела не берутся: их ставит только клиника.
      const pet = newPet({
        id: state.nextPetId,
        owner_id: account.id,
        name: body.name.trim(),
        species: body.species,
        breed: normalizeBreed(body.breed),
        birth_date: body.birth_date ?? null,
        sex: body.sex ?? 'unknown',
      })
      state.nextPetId += 1
      state.pets.push(pet)
      return HttpResponse.json(pet, { status: 201 })
    })
  }),

  http.get('*/api/pets/:petId', ({ request, params }) => {
    const state = readServer()
    const account = authorizeAccount(state, request, { allowed: ['owner'] })
    if (account instanceof Response) return account
    const pet = findPet(state, account.id, params.petId)
    return pet ? HttpResponse.json(pet) : notFound()
  }),

  http.patch('*/api/pets/:petId', async ({ request, params }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const account = authorizeAccount(state, request, { allowed: ['owner'] })
      if (account instanceof Response) return account
      // Проверяются только присланные поля; null проходит только у породы и даты рождения — он их убирает.
      const sent = (field: string) => field in raw
      const invalid = validateBody({
        name: sent('name') ? petNameError(raw.name) : null,
        species: sent('species') ? speciesError(raw.species) : null,
        breed: sent('breed') ? breedError(raw.breed) : null,
        birth_date: sent('birth_date') ? birthDateError(raw.birth_date) : null,
        sex: sent('sex') ? sexError(raw.sex) : null,
      })
      if (invalid) return invalid
      const pet = findPet(state, account.id, params.petId)
      if (!pet) return notFound()
      // photo_url и care_status в теле игнорируются: владелец их не меняет (Р-41).
      const body = raw as PetUpdate
      if (body.name !== undefined) pet.name = body.name.trim()
      if (body.species !== undefined) pet.species = body.species
      if (body.breed !== undefined) pet.breed = normalizeBreed(body.breed)
      if (body.birth_date !== undefined) pet.birth_date = body.birth_date
      if (body.sex !== undefined) pet.sex = body.sex
      return HttpResponse.json(pet)
    })
  }),

  http.post('*/api/pets/:petId/archive', ({ request, params }) =>
    updateServer((state) => {
      const account = authorizeAccount(state, request, { allowed: ['owner'] })
      if (account instanceof Response) return account
      const pet = findPet(state, account.id, params.petId)
      if (!pet) return notFound()
      // Записей и дел в моках нет до этапов 7 и 10 — отменять и удалять нечего; повтор тоже ничего не меняет.
      pet.archived_at ??= new Date().toISOString()
      return HttpResponse.json({ pet, cancelled_appointments: 0, deleted_reminders: 0 })
    }),
  ),
]
