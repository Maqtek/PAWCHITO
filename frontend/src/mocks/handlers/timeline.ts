import { http, HttpResponse } from 'msw'
import type { TimelineItem, TimelineItemType } from '../../api/schema'
import { moscowLocal } from '../../lib/dates'
import { isoDateError } from '../date-validation'
import { authorizeAccount } from '../http-utils'
import { readServer, toAppointment, type MockServerState } from '../server-state'
import { findPet } from './pets'

const LIMIT_DEFAULT = 50
const LIMIT_MAX = 100

/** В один день — приём, курс, прививка, наблюдение (Р-66). */
const TYPE_ORDER: readonly TimelineItemType[] = ['appointment', 'prescription', 'vaccination', 'observation']

/** От новых дат к старым; в один день — по типу, внутри типа — от больших id. */
const byTimelineOrder = (a: TimelineItem, b: TimelineItem) =>
  b.date.localeCompare(a.date) || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || b.data.id - a.data.id

/**
 * Вся лента питомца: наблюдения, прививки, завершённые приёмы с итогом и курсы — рецепты из итогов. Записи в других
 * статусах и отдельные дела в ленту не входят (БП §8).
 */
function petTimeline(state: MockServerState, petId: number): TimelineItem[] {
  const completed = state.appointments.filter((item) => item.pet_id === petId && item.status === 'completed' && item.outcome)
  const items: TimelineItem[] = [
    ...state.observations
      .filter((item) => item.pet_id === petId)
      .map((data): TimelineItem => ({ type: 'observation', date: data.date, data })),
    ...state.vaccinations
      .filter((item) => item.pet_id === petId)
      .map((data): TimelineItem => ({ type: 'vaccination', date: data.date, data })),
    ...completed.map(
      (item): TimelineItem => ({
        type: 'appointment',
        // День приёма — по Москве, даже если время пришло с другим смещением.
        date: moscowLocal(new Date(item.slot_start)).date,
        data: toAppointment(state, item),
      }),
    ),
    ...completed.flatMap((item) =>
      (item.outcome?.prescriptions ?? []).map((data): TimelineItem => ({ type: 'prescription', date: data.start_date, data })),
    ),
  ]
  return items.sort(byTimelineOrder)
}

/**
 * Первые limit элементов, но без разрыва дня: если лимит пришёлся на середину дня, страница добирает весь день —
 * следующая с before = дата последнего элемента ничего не теряет (Р-66).
 */
function page(items: TimelineItem[], limit: number): TimelineItem[] {
  let end = Math.min(limit, items.length)
  while (end < items.length && items[end].date === items[end - 1].date) end += 1
  return items.slice(0, end)
}

// Как у бэкенда: доступ (401/403), параметры (422), поиск питомца (404).
export const timelineHandlers = [
  http.get('*/api/pets/:petId/timeline', ({ request, params }) => {
    const state = readServer()
    const account = authorizeAccount(state, request, { allowed: ['owner'] })
    if (account instanceof Response) return account
    const query = new URL(request.url).searchParams
    const before = query.get('before')
    const rawLimit = query.get('limit')
    const limit = rawLimit === null ? LIMIT_DEFAULT : /^\d+$/.test(rawLimit) ? Number(rawLimit) : Number.NaN
    const detail = [
      { field: 'before', msg: before === null ? null : isoDateError(before, 'Дата') },
      {
        field: 'limit',
        msg: Number.isInteger(limit) && limit >= 1 && limit <= LIMIT_MAX ? null : `limit — целое число от 1 до ${LIMIT_MAX}`,
      },
    ].filter((item) => item.msg !== null)
    if (detail.length > 0) {
      // Все ошибки параметров сразу, в loc ["query", …], как у FastAPI.
      return HttpResponse.json(
        { detail: detail.map(({ field, msg }) => ({ loc: ['query', field], msg, type: 'value_error' })) },
        { status: 422 },
      )
    }
    // Чужой и несуществующий питомец — 404; архивный — как обычно (Р-42).
    const pet = findPet(state, account.id, params.petId)
    if (!pet) return HttpResponse.json({ detail: 'Питомец не найден' }, { status: 404 })
    const items = petTimeline(state, pet.id).filter((item) => before === null || item.date < before)
    return HttpResponse.json(page(items, limit))
  }),
]
