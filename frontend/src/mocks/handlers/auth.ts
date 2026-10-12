import { http, HttpResponse } from 'msw'
import { users } from '../db'
import { unauthorized } from '../http-utils'
import { getMockRole, roleFromRequest, setMockRole, tokenFor } from '../session'

export const authHandlers = [
  http.post('*/api/auth/refresh', () => {
    const role = getMockRole()
    if (role === 'guest') return unauthorized()
    return HttpResponse.json({ access_token: tokenFor(role), token_type: 'bearer', expires_in: 900 })
  }),

  http.post('*/api/auth/logout', () => {
    setMockRole('guest')
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('*/api/users/me', ({ request }) => {
    const role = roleFromRequest(request)
    return role ? HttpResponse.json(users[role]) : unauthorized()
  }),
]
