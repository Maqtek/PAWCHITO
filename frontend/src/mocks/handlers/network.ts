import { http, HttpResponse } from 'msw'
import { readServer } from '../server-state'

/** Сеть выключена (pawchitoMocks.network(false)) — любой запрос к API падает сетевой ошибкой. */
export const networkHandlers = [http.all('*/api/*', () => (readServer().network ? undefined : HttpResponse.error()))]
