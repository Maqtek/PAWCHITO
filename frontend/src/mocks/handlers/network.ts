import { http, HttpResponse } from 'msw'
import { readServer } from '../server-state'
import { isApiRequest } from '../unhandled'

/** «Сеть» моков выключена: запрос к API падает. Модули Vite с /api/ в пути (src/api/*.ts) не трогаем. */
export function isMockOffline(request: Request): boolean {
  return !readServer().network && isApiRequest(request)
}

/** Сеть выключена (pawchitoMocks.network(false)) — любой запрос к API падает сетевой ошибкой. */
export const networkHandlers = [http.all('*/api/*', ({ request }) => (isMockOffline(request) ? HttpResponse.error() : undefined))]
