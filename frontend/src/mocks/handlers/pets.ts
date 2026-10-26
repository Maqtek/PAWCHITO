import { http, HttpResponse } from 'msw'
import type { PetCreate, PetUpdate } from '../../api/schema'
import { authorizeOwner, findPet, petNotFound } from '../access'
import { readBody, validateBody } from '../http-utils'
import { notifyAppointment } from '../notify'
import { birthDateError, breedError, petNameError, sexError, speciesError } from '../pet-validation'
import { cancelFutureAppointments, newPet, readServer, updateServer } from '../server-state'
import { normalizeText } from '../text-validation'

// Как у бэкенда: сначала доступ, потом тело (422), потом поиск питомца (404).
export const petHandlers = [
  http.get('*/api/pets', ({ request }) => {
    const state = readServer()
    const account = authorizeOwner(state, request)
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
      const account = authorizeOwner(state, request)
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
        breed: normalizeText(body.breed),
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
    const account = authorizeOwner(state, request)
    if (account instanceof Response) return account
    const pet = findPet(state, account.id, params.petId)
    return pet ? HttpResponse.json(pet) : petNotFound()
  }),

  http.patch('*/api/pets/:petId', async ({ request, params }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const account = authorizeOwner(state, request)
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
      if (!pet) return petNotFound()
      // photo_url и care_status в теле игнорируются: владелец их не меняет (Р-41).
      const body = raw as PetUpdate
      if (body.name !== undefined) pet.name = body.name.trim()
      if (body.species !== undefined) pet.species = body.species
      if (body.breed !== undefined) pet.breed = normalizeText(body.breed)
      if (body.birth_date !== undefined) pet.birth_date = body.birth_date
      if (body.sex !== undefined) pet.sex = body.sex
      return HttpResponse.json(pet)
    })
  }),

  http.post('*/api/pets/:petId/archive', ({ request, params }) =>
    updateServer((state) => {
      const account = authorizeOwner(state, request)
      if (account instanceof Response) return account
      const pet = findPet(state, account.id, params.petId)
      if (!pet) return petNotFound()
      // Повторное архивирование ничего не меняет (Р-42): будущих записей уже нет.
      if (pet.archived_at !== null) return HttpResponse.json({ pet, cancelled_appointments: 0, deleted_reminders: 0 })
      pet.archived_at = new Date().toISOString()
      const cancelled = cancelFutureAppointments(state, (item) => item.pet_id === pet.id)
      for (const appointment of cancelled) notifyAppointment(state, appointment, 'cancelledPetArchived')
      // Запланированные дела — и свои, и курса — удаляются (Р-02); отмеченные остаются в истории.
      const planned = state.reminders.filter((item) => item.pet_id === pet.id && item.status === 'pending')
      state.reminders = state.reminders.filter((item) => !planned.includes(item))
      return HttpResponse.json({ pet, cancelled_appointments: cancelled.length, deleted_reminders: planned.length })
    }),
  ),
]
