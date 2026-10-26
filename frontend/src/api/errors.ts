import type { ValidationError } from './schema'

interface ApiErrorDetails {
  retryAfter?: number | null
  fieldErrors?: Record<string, string>
  pathErrors?: Record<string, string>
}

/** Ответ API с ошибкой: статус, текст из {"detail": "..."} и подробности для форм. */
export class ApiError extends Error {
  readonly status: number
  readonly detail: string
  /** Секунды из заголовка Retry-After (ответ 429), иначе null. */
  readonly retryAfter: number | null
  /** Ошибки полей из ответа 422: имя поля → текст. */
  readonly fieldErrors: Record<string, string>
  /** Те же ошибки по полному пути без «body»: «prescriptions.0.times» — для форм со списками (итог приёма). */
  readonly pathErrors: Record<string, string>

  constructor(
    status: number,
    detail: string,
    { retryAfter = null, fieldErrors = {}, pathErrors = {} }: ApiErrorDetails = {},
  ) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.retryAfter = retryAfter
    this.fieldErrors = fieldErrors
    this.pathErrors = pathErrors
  }

  /** Ошибка из ответа и его разобранного тела: {"detail": "..."} или массив ошибок полей у 422. */
  static fromResponse(response: Response, body: unknown): ApiError {
    const retryAfter = parseRetryAfter(response.headers.get('Retry-After'))
    const detail = typeof body === 'object' && body !== null && 'detail' in body ? body.detail : undefined
    if (Array.isArray(detail)) {
      const items = detail as ValidationError[]
      const fieldErrors = Object.fromEntries(items.map((item) => [String(item.loc[item.loc.length - 1]), item.msg]))
      const pathErrors = Object.fromEntries(
        items.map((item) => [item.loc.filter((part, index) => index > 0 || (part !== 'body' && part !== 'query')).join('.'), item.msg]),
      )
      return new ApiError(response.status, Object.values(fieldErrors).join('; '), { retryAfter, fieldErrors, pathErrors })
    }
    return new ApiError(response.status, typeof detail === 'string' ? detail : response.statusText, { retryAfter })
  }
}

function parseRetryAfter(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}

/** Сервер недоступен: нет сети, таймаут или сбой при обновлении токена. Сессию не завершает (БП §1). */
export class NetworkError extends Error {
  constructor() {
    super('Нет связи с сервером')
    this.name = 'NetworkError'
  }
}

/** Ошибка сети: наш NetworkError, TypeError, которым fetch сообщает об обрыве, или таймаут запроса (AbortSignal.timeout). */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof NetworkError || error instanceof TypeError) return true
  // DOMException из разных окружений (браузер, jsdom, Node) — сверяем по имени, а не по классу.
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined
  return name === 'TimeoutError' || name === 'AbortError'
}
