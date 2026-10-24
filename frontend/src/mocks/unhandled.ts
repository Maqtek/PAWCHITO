import type { UnhandledFrameHandle } from 'msw'
import { HttpNetworkFrame } from 'msw/experimental'

/** Запрос к нашему API: без обработчика он уйдёт через прокси Vite на настоящий бэкенд. */
export function isApiRequest(request: Request): boolean {
  return new URL(request.url).pathname.startsWith('/api/')
}

/**
 * Без обработчика остаются и навигация (GET /login), и модули с ассетами Vite — о них молчим.
 * Предупреждаем только про /api/: значит, для эндпоинта ещё нет мока в src/mocks/handlers.
 */
export const onUnhandledFrame: UnhandledFrameHandle = ({ frame, defaults }) => {
  if (frame instanceof HttpNetworkFrame && isApiRequest(frame.data.request)) defaults.warn()
}
