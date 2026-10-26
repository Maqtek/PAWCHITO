import { http, HttpResponse } from 'msw'
import { toMoscowString } from '../../lib/dates'
import { authorizeAccount } from '../http-utils'
import { readServer, updateServer, type MockNotification, type MockServerState } from '../server-state'

const LIMIT_MAX = 50

/** Ответ Notification — без user_id: кому уведомление, решает токен. */
const toNotification = ({ id, type, text, link, created_at, read_at }: MockNotification) => ({
  id,
  type,
  text,
  link,
  created_at,
  read_at,
})

const ownNotifications = (state: MockServerState, userId: number) =>
  state.notifications.filter((item) => item.user_id === userId)

const unread = (items: MockNotification[]) => items.filter((item) => item.read_at === null).length

// Владелец и клиника видят только свои уведомления; у администратора их нет (БП §9).
export const notificationHandlers = [
  http.get('*/api/notifications/unread-count', ({ request }) => {
    const state = readServer()
    const account = authorizeAccount(state, request, { allowed: ['owner', 'clinic'] })
    if (account instanceof Response) return account
    return HttpResponse.json({ unread_count: unread(ownNotifications(state, account.id)) })
  }),

  http.get('*/api/notifications', ({ request }) => {
    const state = readServer()
    const account = authorizeAccount(state, request, { allowed: ['owner', 'clinic'] })
    if (account instanceof Response) return account
    const raw = new URL(request.url).searchParams.get('limit')
    const limit = raw === null ? LIMIT_MAX : Number(raw)
    if (!Number.isInteger(limit) || limit < 1 || limit > LIMIT_MAX) {
      return HttpResponse.json(
        { detail: [{ loc: ['query', 'limit'], msg: `limit — от 1 до ${LIMIT_MAX}`, type: 'value_error' }] },
        { status: 422 },
      )
    }
    const own = ownNotifications(state, account.id)
    // От новых к старым; в одну секунду — от последнего созданного (Р-55).
    const items = [...own].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id).slice(0, limit)
    return HttpResponse.json({ unread_count: unread(own), items: items.map(toNotification) })
  }),

  http.post('*/api/notifications/read-all', ({ request }) =>
    updateServer((state) => {
      const account = authorizeAccount(state, request, { allowed: ['owner', 'clinic'] })
      if (account instanceof Response) return account
      const now = toMoscowString(new Date())
      for (const item of ownNotifications(state, account.id)) item.read_at ??= now
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  http.post('*/api/notifications/:id/read', ({ request, params }) =>
    updateServer((state) => {
      const account = authorizeAccount(state, request, { allowed: ['owner', 'clinic'] })
      if (account instanceof Response) return account
      const notification = ownNotifications(state, account.id).find((item) => item.id === Number(params.id))
      // Чужое уведомление — как несуществующее (Р-55); повторная отметка ничего не меняет.
      if (!notification) return HttpResponse.json({ detail: 'Уведомление не найдено' }, { status: 404 })
      notification.read_at ??= toMoscowString(new Date())
      return new HttpResponse(null, { status: 204 })
    }),
  ),
]
