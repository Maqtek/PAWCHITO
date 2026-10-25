import createClient, { type Middleware } from 'openapi-fetch'
import { getAccessToken } from './auth-token'
import { apiBaseUrl } from './base-url'
import { NetworkError } from './errors'
import type { paths } from './schema'
import { endSession, ensureSession, isRestoreUnavailable, refreshAccessToken } from './session'

/** Запросы, которые сами управляют сессией: токен к ним не добавляем и не обновляем. */
const SESSION_PATHS = new Set(['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout', '/auth/recover'])

interface SentRequest {
  retry: Request
  token: string | null
  /** Токена нет, потому что восстановление сессии не удалось из-за сбоя сети или сервера. */
  restoreUnavailable: boolean
}

const sentRequests = new Map<string, SentRequest>()

function retryWith(request: Request, token: string): Promise<Response> {
  request.headers.set('Authorization', `Bearer ${token}`)
  return globalThis.fetch(request)
}

const authMiddleware: Middleware = {
  async onRequest({ request, schemaPath, id }) {
    if (SESSION_PATHS.has(schemaPath)) return undefined
    await ensureSession()
    const token = getAccessToken()
    if (token) request.headers.set('Authorization', `Bearer ${token}`)
    sentRequests.set(id, { retry: request.clone(), token, restoreUnavailable: !token && isRestoreUnavailable() })
    return request
  },

  async onResponse({ response, id }) {
    const sent = sentRequests.get(id)
    sentRequests.delete(id)
    if (response.status !== 401 || !sent) return undefined
    if (!sent.token) {
      // Токена нет из-за сбоя при восстановлении — это не гость, выходом считать нельзя (БП §1).
      if (sent.restoreUnavailable) throw new NetworkError()
      // Иначе запрос ушёл гостем: восстановить сессию уже пробовали, второй обмен не нужен.
      return undefined
    }

    // Если токен уже обновил параллельный запрос — берём его, иначе обновляем сами.
    const current = getAccessToken()
    if (current && current !== sent.token) return retryWith(sent.retry, current)

    const result = await refreshAccessToken()
    if (result.status === 'ok') return retryWith(sent.retry, result.token)
    // БП §1: сбой сети или сервера не разлогинивает — запрос падает как сетевая ошибка.
    if (result.status === 'unavailable') throw new NetworkError()
    endSession()
    return undefined
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
