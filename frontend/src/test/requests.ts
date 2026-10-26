import { http } from 'msw'
import { vi } from 'vitest'
import { server } from '../mocks/node'

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

/** Тело запроса: JSON разобран, пустое тело — undefined, не JSON — текстом. */
function parseBody(text: string): unknown {
  if (text === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Записывает запросы method к path и ничего не отвечает: запрос уходит дальше — в обработчик, добавленный раньше,
 * или в моки. Поэтому свой ответ (ворота, ошибку) добавляйте до записи.
 */
export function recordRequests(method: Method, path: string) {
  const bodies: unknown[] = []
  server.use(
    http[method](path, async ({ request }) => {
      bodies.push(parseBody(await request.clone().text()))
    }),
  )
  return {
    /** Тела по порядку запросов. */
    bodies,
    get count() {
      return bodies.length
    },
  }
}

/** Пауза, за которую ушёл бы запрос, если бы приложение его отправило: перед проверкой, что запроса нет. */
export const settle = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Подменяет таймаут запросов приложения: expire() — «время вышло». Подменять перед самой отправкой:
 * обмен токена при загрузке берёт свой таймаут.
 */
export function stubRequestTimeout() {
  const controller = new AbortController()
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
  return { expire: () => controller.abort(new DOMException('Истекло время', 'TimeoutError')) }
}
