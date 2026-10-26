import { http, HttpResponse } from 'msw'
import type { EventCategory, Prescription, ReminderStatus } from '../../api/schema'
import { addDays, moscowDateTime, moscowLocal, toMoscowString } from '../../lib/dates'
import { readBody, validateBody } from '../auth-validation'
import { isoDateError } from '../date-validation'
import { authorizeAccount } from '../http-utils'
import { categoryError, dueAtError, reminderTitleError, repeatError } from '../reminder-validation'
import { readServer, toReminder, updateServer, type MockReminder, type MockServerState } from '../server-state'
import { findPet } from './pets'

const STATUSES: readonly ReminderStatus[] = ['pending', 'done', 'skipped']

const notFound = (detail: string) => HttpResponse.json({ detail }, { status: 404 })
const conflict = (detail: string) => HttpResponse.json({ detail }, { status: 409 })
const queryError = (field: string, msg: string) =>
  HttpResponse.json({ detail: [{ loc: ['query', field], msg, type: 'value_error' }] }, { status: 422 })

/** Рецепт из итога приёма своего питомца, в том числе архивного; чужой — как несуществующий. */
function ownPrescription(state: MockServerState, ownerId: number, rawId: unknown): Prescription | undefined {
  const id = Number(rawId)
  for (const appointment of state.appointments) {
    const prescription = appointment.outcome?.prescriptions.find((item) => item.id === id)
    if (prescription) return findPet(state, ownerId, appointment.pet_id) ? prescription : undefined
  }
  return undefined
}

/** Дело питомца владельца; чужое — как несуществующее, 404. */
function ownReminder(state: MockServerState, ownerId: number, rawId: unknown): MockReminder | undefined {
  const id = Number(rawId)
  const reminder = state.reminders.find((item) => item.id === id)
  return reminder && findPet(state, ownerId, reminder.pet_id) ? reminder : undefined
}

const byDueAt = (a: MockReminder, b: MockReminder) => Date.parse(a.due_at) - Date.parse(b.due_at) || a.id - b.id

/**
 * Отметка дела (Р-61): только «Запланировано» и только наступившего дня по Москве. Следующее дело серии — на плановую
 * дату + интервал, в то же время, даже если и оно уже прошло.
 */
function mark(status: Exclude<ReminderStatus, 'pending'>) {
  return ({ request, params }: { request: Request; params: Record<string, unknown> }) =>
    updateServer((state) => {
      const account = authorizeAccount(state, request, { allowed: ['owner'] })
      if (account instanceof Response) return account
      const reminder = ownReminder(state, account.id, params.id)
      if (!reminder) return notFound('Дело не найдено')
      if (reminder.status !== 'pending') return conflict('Дело уже отмечено')
      const now = new Date()
      const { date, time } = moscowLocal(new Date(reminder.due_at))
      if (date > moscowLocal(now).date) return conflict('Дело ещё не наступило')
      reminder.status = status
      reminder.done_at = toMoscowString(now)
      let next: MockReminder | null = null
      if (reminder.source === 'custom' && reminder.repeat_interval_days !== null) {
        next = {
          ...reminder,
          id: state.nextReminderId,
          due_at: moscowDateTime(addDays(date, reminder.repeat_interval_days), time),
          status: 'pending',
          done_at: null,
          series_id: reminder.series_id ?? reminder.id,
        }
        state.nextReminderId += 1
        state.reminders.push(next)
      }
      return HttpResponse.json({ reminder: toReminder(reminder, now), next: next && toReminder(next, now) })
    })
}

// Как у бэкенда: доступ (401/403), тело или параметры (422), поиск (404), источник (403), статус (409).
export const reminderHandlers = [
  http.get('*/api/reminders', ({ request }) => {
    const state = readServer()
    const account = authorizeAccount(state, request, { allowed: ['owner'] })
    if (account instanceof Response) return account
    const query = new URL(request.url).searchParams
    const rawPet = query.get('pet_id')
    const pet = rawPet === null ? null : findPet(state, account.id, rawPet)
    // Фильтр, а не путь: чужой питомец и чужой рецепт — 422, как vet_id у клиники (Р-60).
    if (pet === undefined) return queryError('pet_id', 'Питомец не найден')
    const rawPrescription = query.get('prescription_id')
    const prescription = rawPrescription === null ? null : ownPrescription(state, account.id, rawPrescription)
    if (prescription === undefined) return queryError('prescription_id', 'Рецепт не найден')
    const status = query.get('status')
    if (status !== null && !STATUSES.includes(status as ReminderStatus)) {
      return queryError('status', 'Статус: pending, done или skipped')
    }
    const from = query.get('date_from')
    const to = query.get('date_to')
    for (const [field, value] of [['date_from', from], ['date_to', to]] as const) {
      const error = value === null ? null : isoDateError(value, 'Дата')
      if (error) return queryError(field, error)
    }
    if (from !== null && to !== null && to < from) return queryError('date_to', 'Дата «по» раньше даты «с»')

    const now = new Date()
    const list = state.reminders.filter((item) => {
      if (!findPet(state, account.id, item.pet_id)) return false
      if (pet && item.pet_id !== pet.id) return false
      if (prescription && item.prescription_id !== prescription.id) return false
      if (status !== null && item.status !== status) return false
      const day = moscowLocal(new Date(item.due_at)).date
      return (from === null || day >= from) && (to === null || day <= to)
    })
    return HttpResponse.json(list.sort(byDueAt).map((item) => toReminder(item, now)))
  }),

  http.post('*/api/reminders', async ({ request }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const account = authorizeAccount(state, request, { allowed: ['owner'] })
      if (account instanceof Response) return account
      const now = new Date()
      const found = typeof raw.pet_id === 'number' ? findPet(state, account.id, raw.pet_id) : undefined
      const pet = found?.archived_at === null ? found : undefined
      const invalid = validateBody({
        // Ссылка в теле: чужой, архивный и несуществующий питомец — одно и то же 422 (Р-59).
        pet_id: pet ? null : 'Питомец не найден или в архиве',
        title: reminderTitleError(raw.title),
        due_at: dueAtError(raw.due_at, now),
        category: raw.category === undefined ? null : categoryError(raw.category),
        repeat_interval_days: raw.repeat_interval_days === undefined ? null : repeatError(raw.repeat_interval_days),
      })
      if (invalid) return invalid
      if (!pet) throw new Error('pet_id прошёл проверку, но не найден')
      const id = state.nextReminderId
      const repeat = (raw.repeat_interval_days as number | null | undefined) ?? null
      const reminder: MockReminder = {
        id,
        pet_id: pet.id,
        source: 'custom',
        prescription_id: null,
        title: (raw.title as string).trim(),
        category: (raw.category as EventCategory | undefined) ?? 'routine',
        due_at: toMoscowString(new Date(raw.due_at as string)),
        status: 'pending',
        done_at: null,
        repeat_interval_days: repeat,
        // Серия — по первому делу: следующие получат его id (Р-61).
        series_id: repeat === null ? null : id,
      }
      state.nextReminderId += 1
      state.reminders.push(reminder)
      return HttpResponse.json(toReminder(reminder, now), { status: 201 })
    })
  }),

  http.post('*/api/reminders/:id/done', mark('done')),
  http.post('*/api/reminders/:id/skip', mark('skipped')),

  http.delete('*/api/reminders/:id', ({ request, params }) =>
    updateServer((state) => {
      const account = authorizeAccount(state, request, { allowed: ['owner'] })
      if (account instanceof Response) return account
      const reminder = ownReminder(state, account.id, params.id)
      if (!reminder) return notFound('Дело не найдено')
      if (reminder.source === 'prescription') return HttpResponse.json({ detail: 'Дела курса не удаляются' }, { status: 403 })
      // Отметка окончательная: отмеченное дело остаётся в истории (Р-62).
      if (reminder.status !== 'pending') return conflict('Отмеченное дело не удаляется')
      // Запланированное в серии одно — следующее создаётся при отметке; удаляем и его, и всё запланированное после.
      state.reminders = state.reminders.filter(
        (item) =>
          item.id !== reminder.id &&
          !(
            reminder.series_id !== null &&
            item.series_id === reminder.series_id &&
            item.status === 'pending' &&
            Date.parse(item.due_at) > Date.parse(reminder.due_at)
          ),
      )
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  http.get('*/api/prescriptions/:id/progress', ({ request, params }) => {
    const state = readServer()
    const account = authorizeAccount(state, request, { allowed: ['owner'] })
    if (account instanceof Response) return account
    const prescription = ownPrescription(state, account.id, params.id)
    if (!prescription) return notFound('Рецепт не найден')
    const course = state.reminders.filter((item) => item.prescription_id === prescription.id)
    const count = (status: ReminderStatus) => course.filter((item) => item.status === status).length
    return HttpResponse.json({
      prescription_id: prescription.id,
      total: course.length,
      done: count('done'),
      skipped: count('skipped'),
      pending: count('pending'),
    })
  }),
]
