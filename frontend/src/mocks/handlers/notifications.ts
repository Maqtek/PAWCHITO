import { http, HttpResponse } from 'msw'
import { unreadCount } from '../db'
import { authorize } from '../http-utils'

export const notificationHandlers = [
  http.get('*/api/notifications/unread-count', ({ request }) => {
    const role = authorize(request, ['owner', 'clinic'])
    if (role instanceof Response) return role
    return HttpResponse.json({ unread_count: unreadCount[role] })
  }),
]
