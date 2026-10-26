import { http, HttpResponse } from 'msw'
import type { HomeCourse, Pet, Prescription, Reminder } from '../../api/schema'
import { addDays, moscowLocal } from '../../lib/dates'
import { authorizeAccount } from '../http-utils'
import { readServer, toAppointment, toReminder, type MockServerState } from '../server-state'
import { findPet } from './pets'

const queryError = (msg: string) =>
  HttpResponse.json({ detail: [{ loc: ['query', 'pet_id'], msg, type: 'value_error' }] }, { status: 422 })

/** Курсы питомца, последний день которых не прошёл (Р-63), от новых к старым по дате начала. */
function activeCourses(state: MockServerState, pet: Pet, today: string): HomeCourse[] {
  const prescriptions: Prescription[] = state.appointments
    .filter((item) => item.pet_id === pet.id)
    .flatMap((item) => item.outcome?.prescriptions ?? [])
    .filter((item) => addDays(item.start_date, item.duration_days - 1) >= today)
    .sort((a, b) => b.start_date.localeCompare(a.start_date) || b.id - a.id)
  return prescriptions.map(({ id, drug, dosage }) => {
    // Как GET /prescriptions/{id}/progress: дела, удалённые при архивировании питомца, не считаются.
    const course = state.reminders.filter((item) => item.prescription_id === id)
    const count = (status: Reminder['status']) => course.filter((item) => item.status === status).length
    return { prescription_id: id, drug, dosage, total: course.length, done: count('done'), skipped: count('skipped') }
  })
}

// Как у бэкенда: доступ (401/403), параметры (422), поиск питомца (404).
export const homeHandlers = [
  http.get('*/api/home/summary', ({ request }) => {
    const state = readServer()
    const account = authorizeAccount(state, request, { allowed: ['owner'] })
    if (account instanceof Response) return account
    const raw = new URL(request.url).searchParams.get('pet_id')
    if (raw === null) return queryError('Укажите питомца')
    if (!/^-?\d+$/.test(raw)) return queryError('Номер питомца — целое число')
    // Питомец — то, о чём запрос, а не фильтр списка: чужой и несуществующий — 404 (Р-64). Архивный — как обычно (Р-42).
    const pet = findPet(state, account.id, raw)
    if (!pet) return HttpResponse.json({ detail: 'Питомец не найден' }, { status: 404 })

    const now = new Date()
    const today = moscowLocal(now).date
    const reminders = state.reminders
      .filter((item) => item.pet_id === pet.id && item.status === 'pending' && moscowLocal(new Date(item.due_at)).date <= today)
      .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at) || a.id - b.id)
    const next = state.appointments
      .filter(
        (item) =>
          item.pet_id === pet.id &&
          (item.status === 'requested' || item.status === 'confirmed') &&
          Date.parse(item.slot_start) > now.getTime(),
      )
      .sort((a, b) => Date.parse(a.slot_start) - Date.parse(b.slot_start) || a.id - b.id)[0]

    return HttpResponse.json({
      pet,
      active_courses: activeCourses(state, pet, today),
      today: reminders.map((item) => toReminder(item, now)),
      next_appointment: next ? toAppointment(state, next) : null,
    })
  }),
]
