import createClient, { type Middleware } from 'openapi-fetch'
import { getAccessToken, setAccessToken } from './auth-token'
import type { paths } from './schema'

/** Запросы, которые сами управляют сессией: токен к ним не добавляем и не обновляем. */
const SESSION_PATHS = new Set(['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout', '/auth/recover'])

export function apiBaseUrl(): string {
  return new URL('/api', window.location.origin).toString()
}

let refreshInFlight: Promise<string | null> | null = null

/** Обменивает refresh-cookie на новый access-токен. Параллельные вызовы ждут один запрос. */
export function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= globalThis
    .fetch(`${apiBaseUrl()}/auth/refresh`, { method: 'POST', credentials: 'same-origin' })
    .then(async (response) => (response.ok ? ((await response.json()) as { access_token: string }).access_token : null))
    .catch(() => null)
    .then((token) => {
      setAccessToken(token)
      return token
    })
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

interface SentRequest {
  retry: Request
  token: string | null
}

const sentRequests = new Map<string, SentRequest>()

const authMiddleware: Middleware = {
  onRequest({ request, schemaPath, id }) {
    if (SESSION_PATHS.has(schemaPath)) return undefined
    const token = getAccessToken()
    if (token) request.headers.set('Authorization', `Bearer ${token}`)
    sentRequests.set(id, { retry: request.clone(), token })
    return request
  },

  async onResponse({ response, id }) {
    const sent = sentRequests.get(id)
    sentRequests.delete(id)
    if (response.status !== 401 || !sent) return undefined

    // Если токен уже обновил параллельный запрос — берём его, иначе обновляем сами.
    const current = getAccessToken()
    const token = current && current !== sent.token ? current : await refreshAccessToken()
    if (!token) return undefined

    sent.retry.headers.set('Authorization', `Bearer ${token}`)
    return globalThis.fetch(sent.retry)
  },

  onError({ id }) {
    sentRequests.delete(id)
    return undefined
  },
}

export const api = createClient<paths>({
  baseUrl: apiBaseUrl(),
  // fetch берём в момент запроса, чтобы MSW в тестах успел его подменить.
  fetch: (request) => globalThis.fetch(request),
})

api.use(authMiddleware)
