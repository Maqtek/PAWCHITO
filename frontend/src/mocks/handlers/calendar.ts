import { http, HttpResponse } from 'msw'
import type { AppointmentReason, AppointmentStatus, Calendar, CalendarEvent, EventCategory } from '../../api/schema'
import { addDays, moscowDateTime, moscowLocal } from '../../lib/dates'
import { appointmentReasonLabel } from '../../lib/labels'
import { authorizeAccount, notFound, queryError } from '../http-utils'
import { readServer, toAppointment, toReminder } from '../server-state'
import { findPet } from './pets'

/** Сколько дней вперёд от сегодня показывает календарь (Р-65). */
const DAYS_AHEAD = 30

/** Записи, которые ещё ждут приёма: «Заявка» и «Подтверждена». */
const ACTIVE: readonly AppointmentStatus[] = ['requested', 'confirmed']

/** Тип события записи — по причине обращения (БП §5, «Причина обращения»). */
const REASON_CATEGORY: Record<AppointmentReason, EventCategory> = {
  checkup: 'routine',
  vaccination: 'prevention',
  illness: 'treatment',
  follow_up: 'treatment',
  other: 'routine',
}

/** При равном времени — дело, запись, прививка (Р-65). */
const TYPE_ORDER: Record<CalendarEvent['type'], number> = { reminder: 0, appointment: 1, vaccination_due: 2 }

/** Момент события; у срока прививки времени нет — он в начале дня по Москве. */
const instant = (event: CalendarEvent) =>
  Date.parse(event.type === 'vaccination_due' ? moscowDateTime(event.at, '00:00') : event.at)

const byAt = (a: CalendarEvent, b: CalendarEvent) =>
  instant(a) - instant(b) || TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.id - b.id

const dayOf = (at: string) => moscowLocal(new Date(at)).date

// Как у бэкенда: доступ (401/403), параметры (422), поиск питомца (404).
export const calendarHandlers = [
  http.get('*/api/calendar', ({ request }) => {
    const state = readServer()
    const account = authorizeAccount(state, request, { allowed: ['owner'] })
    if (account instanceof Response) return account
    const rawPet = new URL(request.url).searchParams.get('pet_id')
    if (rawPet === null) return queryError('pet_id', 'Укажите питомца', 'missing')
    if (!/^\d+$/.test(rawPet)) return queryError('pet_id', 'Номер питомца — целое число', 'int_parsing')
    // Календарь — о питомце, а не фильтр списка: чужой — 404, как несуществующий; архивный — как обычно (Р-64, Р-65).
    const pet = findPet(state, account.id, rawPet)
    if (!pet) return notFound('Питомец не найден')

    const now = new Date()
    const today = moscowLocal(now).date
    const tomorrow = addDays(today, 1)
    const lastDay = addDays(today, DAYS_AHEAD)
    // Событие и день его группы по Москве.
    const events: [string, CalendarEvent][] = []

    for (const item of state.reminders) {
      if (item.pet_id !== pet.id || item.status !== 'pending') continue
      const day = dayOf(item.due_at)
      if (day > lastDay) continue
      const { id, due_at, title, category, status, is_overdue, source, repeat_interval_days } = toReminder(item, now)
      // Просроченные дела — в «Сегодня», сколько бы дней ни прошло.
      events.push([
        day < today ? today : day,
        { type: 'reminder', id, at: due_at, title, category, status, is_overdue, source, repeat_interval_days },
      ])
    }

    for (const item of state.appointments) {
      if (item.pet_id !== pet.id || !ACTIVE.includes(item.status)) continue
      const day = dayOf(item.slot_start)
      // Запись на сегодня остаётся до конца дня, даже если время прошло, — она ждёт итога или отмены.
      if (day < today || day > lastDay) continue
      const { slot_start, status, clinic, vet } = toAppointment(state, item)
      events.push([
        day,
        {
          type: 'appointment',
          id: item.id,
          at: slot_start,
          title: appointmentReasonLabel[item.reason],
          category: REASON_CATEGORY[item.reason],
          status,
          clinic,
          vet,
        },
      ])
    }

    for (const item of state.vaccinations) {
      // Просроченный срок в календарь не попадает: он виден в «Истории» с меткой «Просрочена» (Р-46).
      if (item.pet_id !== pet.id || item.next_date === null || item.next_date < today || item.next_date > lastDay) continue
      events.push([
        item.next_date,
        { type: 'vaccination_due', id: item.id, at: item.next_date, title: item.name, category: 'prevention' },
      ])
    }

    const group = (matches: (day: string) => boolean) =>
      events
        .filter(([day]) => matches(day))
        .map(([, event]) => event)
        .sort(byAt)
    const calendar: Calendar = {
      today: group((day) => day === today),
      tomorrow: group((day) => day === tomorrow),
      later: group((day) => day > tomorrow),
    }
    return HttpResponse.json(calendar)
  }),
]
