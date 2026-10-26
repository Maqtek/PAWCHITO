import { http, HttpResponse } from 'msw'
import type { HomeCourse, Pet } from '../../api/schema'
import { addDays, moscowLocal } from '../../lib/dates'
import { authorizeOwner, byDueAt, bySlotStart, courseProgress, findPet, petNotFound } from '../access'
import { queryError } from '../http-utils'
import {
  hasStarted,
  isActiveAppointment,
  readServer,
  toAppointment,
  toReminder,
  type MockServerState,
} from '../server-state'

/** Курсы питомца, последний день которых не прошёл (Р-63), от новых к старым по дате начала. */
function activeCourses(state: MockServerState, pet: Pet, today: string): HomeCourse[] {
  const prescriptions = state.appointments
    .filter((item) => item.pet_id === pet.id)
    .flatMap((item) => item.outcome?.prescriptions ?? [])
    .filter((item) => addDays(item.start_date, item.duration_days - 1) >= today)
    .sort((a, b) => b.start_date.localeCompare(a.start_date) || b.id - a.id)
  return prescriptions.map(({ id, drug, dosage }) => {
    // Как GET /prescriptions/{id}/progress.
    const { total, done, skipped } = courseProgress(state, id)
    return { prescription_id: id, drug, dosage, total, done, skipped }
  })
}

// Как у бэкенда: доступ (401/403), параметры (422), поиск питомца (404).
export const homeHandlers = [
  http.get('*/api/home/summary', ({ request }) => {
    const state = readServer()
    const account = authorizeOwner(state, request)
    if (account instanceof Response) return account
    const raw = new URL(request.url).searchParams.get('pet_id')
    if (raw === null) return queryError('pet_id', 'Укажите питомца')
    if (!/^-?\d+$/.test(raw)) return queryError('pet_id', 'Номер питомца — целое число')
    // Питомец — то, о чём запрос, а не фильтр списка: чужой и несуществующий — 404 (Р-64). Архивный — как обычно (Р-42).
    const pet = findPet(state, account.id, raw)
    if (!pet) return petNotFound()

    const now = new Date()
    const today = moscowLocal(now).date
    const reminders = state.reminders
      .filter((item) => item.pet_id === pet.id && item.status === 'pending' && moscowLocal(new Date(item.due_at)).date <= today)
      .sort(byDueAt)
    const next = state.appointments
      .filter((item) => item.pet_id === pet.id && isActiveAppointment(item) && !hasStarted(item, now))
      .sort((a, b) => bySlotStart(a, b) || a.id - b.id)[0]

    return HttpResponse.json({
      pet,
      active_courses: activeCourses(state, pet, today),
      today: reminders.map((item) => toReminder(item, now)),
      next_appointment: next ? toAppointment(state, next) : null,
    })
  }),
]
