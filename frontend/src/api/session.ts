import { getAccessToken, setAccessToken } from './auth-token'
import { apiBaseUrl } from './base-url'
import { ApiError, NetworkError } from './errors'

type RefreshResult =
  | { status: 'ok'; token: string }
  /** Сервер отказал в обмене (401 и другие 4xx) или стоит метка выхода. */
  | { status: 'signed-out' }
  /** Нет сети, таймаут, 5xx, 408 или 429: сессию не завершаем. */
  | { status: 'unavailable' }

export type SessionEvent =
  /** Сессия была и закончилась: сервер отказал в обмене токена. */
  | { type: 'expired' }
  | { type: 'signed-out'; serverConfirmed: boolean }
  | { type: 'signed-out-elsewhere' }
  | { type: 'signed-in-elsewhere' }
  /** Сервер ответил 403 password_change_required: временный пароль не сменён. */
  | { type: 'password-change-required' }

type TabMessage = { type: 'signed-in' } | { type: 'signed-out' }

const LOGOUT_PENDING_KEY = 'pawchito:logout-pending'
const REFRESH_LOCK = 'pawchito:refresh'
const CHANNEL_NAME = 'pawchito:session'
/** Запросы, которые экран не даёт бросить (сессия, изменения в окнах и формах), на зависшей сети иначе ждут вечно. */
export const REQUEST_TIMEOUT_MS = 10_000

let restoring: Promise<void> | null = null
let refreshInFlight: Promise<RefreshResult> | null = null
let pendingLogout: Promise<boolean> | null = null
let restoreUnavailable = false
/** Растёт при каждом входе и выходе в этой или другой вкладке: обмен, начатый раньше, свой результат не применяет. */
let generation = 0
/** Поколение, в котором уже сообщили об истечении: параллельные 401 дают одно событие. */
let expiredIn = -1
const listeners = new Set<(event: SessionEvent) => void>()

// --- Метка «выход не завершён»: общая для вкладок, переживает перезагрузку ---

function isLogoutPending(): boolean {
  try {
    return localStorage.getItem(LOGOUT_PENDING_KEY) === '1'
  } catch {
    return false
  }
}

function setLogoutPending(pending: boolean): void {
  try {
    if (pending) localStorage.setItem(LOGOUT_PENDING_KEY, '1')
    else localStorage.removeItem(LOGOUT_PENDING_KEY)
  } catch {
    // хранилище недоступно — выход без сети останется только локальным
  }
}

// --- События для React ---

function emit(event: SessionEvent): void {
  listeners.forEach((listener) => listener(event))
}

export function onSessionChange(listener: (event: SessionEvent) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// --- Другие вкладки ---

function openChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  const opened = new BroadcastChannel(CHANNEL_NAME)
  opened.onmessage = (event: MessageEvent<unknown>) => {
    const type = (event.data as { type?: unknown } | null)?.type
    // Сообщения других типов (например, из новой версии в соседней вкладке) не трогают сессию.
    if (type !== 'signed-out' && type !== 'signed-in') return
    generation += 1
    setAccessToken(null)
    if (type === 'signed-out') {
      emit({ type: 'signed-out-elsewhere' })
    } else {
      // Вошли заново — следующий запрос восстановит сессию по новой cookie.
      restoring = null
      emit({ type: 'signed-in-elsewhere' })
    }
  }
  return opened
}

let channel = openChannel()

function tellOtherTabs(message: TabMessage): void {
  channel?.postMessage(message)
}

// --- Запросы к серверу авторизации: прямой fetch, без middleware клиента ---

function postAuth(path: '/auth/refresh' | '/auth/logout'): Promise<Response> {
  return globalThis.fetch(`${apiBaseUrl()}${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
}

/** Сервер не ответил по существу: 5xx, 408, 429 — сессию по такому ответу не завершаем. */
function isServerUnavailable(status: number): boolean {
  return status >= 500 || status === 408 || status === 429
}

async function exchangeCookie(): Promise<RefreshResult> {
  try {
    const response = await postAuth('/auth/refresh')
    if (response.ok) {
      const { access_token: token } = (await response.json()) as { access_token: string }
      return { status: 'ok', token }
    }
    // 401 по контракту; 400/403/404/422 тоже значат «сессии по cookie нет», иначе гость застрянет на «Повторить».
    return isServerUnavailable(response.status) ? { status: 'unavailable' } : { status: 'signed-out' }
  } catch {
    return { status: 'unavailable' }
  }
}

async function requestRefresh(): Promise<RefreshResult> {
  // Пока вкладка ждала очереди, другая могла выйти.
  if (isLogoutPending()) return { status: 'signed-out' }
  const startedIn = generation
  const result = await exchangeCookie()
  // Пока шёл обмен, вошли или вышли: ответ устарел, токен не трогаем.
  if (generation !== startedIn) return { status: 'unavailable' }
  if (result.status !== 'unavailable') setAccessToken(result.status === 'ok' ? result.token : null)
  return result
}

/**
 * Refresh-токен одноразовый: две вкладки с одной cookie отзовут все токены пользователя (БП §1).
 * Поэтому обмен идёт по очереди: браузер применяет Set-Cookie раньше, чем fetch вернёт ответ,
 * и следующая вкладка отправит уже новую cookie.
 */
function inRefreshQueue<T>(task: () => Promise<T>): Promise<T> {
  if (!('locks' in navigator)) return task()
  let started = false
  return navigator.locks
    .request(REFRESH_LOCK, () => {
      started = true
      return task()
    })
    .catch((error: unknown) => {
      // Блокировку не дали (например, SecurityError в песочнице) — работаем без очереди. Ошибку самой задачи не повторяем.
      if (started) throw error
      return task()
    })
}

/** Обменивает refresh-cookie на access-токен. Параллельные вызовы вкладки ждут один запрос. */
export function refreshAccessToken(): Promise<RefreshResult> {
  if (isLogoutPending()) return Promise.resolve({ status: 'signed-out' })
  if (!refreshInFlight) {
    const exchange: Promise<RefreshResult> = inRefreshQueue(requestRefresh).finally(() => {
      // Обнуляем, только если это всё ещё наш обмен: после сброса там может быть новый.
      if (refreshInFlight === exchange) refreshInFlight = null
    })
    refreshInFlight = exchange
  }
  return refreshInFlight
}

/** Отзывает refresh-токен на сервере. true — сервер ответил по существу (2xx, 401 и другие 4xx): отзывать больше нечего. */
async function finishLogout(): Promise<boolean> {
  try {
    const response = await postAuth('/auth/logout')
    const confirmed = !isServerUnavailable(response.status)
    if (confirmed) setLogoutPending(false)
    return confirmed
  } catch {
    return false
  }
}

/** Доводит выход, начатый без сети: при запуске приложения, при восстановлении сессии и по событию online. Параллельные вызовы ждут один запрос. */
export function finishPendingLogout(): Promise<boolean> {
  if (!isLogoutPending()) return Promise.resolve(true)
  if (!pendingLogout) {
    const attempt: Promise<boolean> = inRefreshQueue(() =>
      // Пока ждали очереди, выход мог довести вход в этой или другой вкладке — тогда отзывать нечего.
      isLogoutPending() ? finishLogout() : Promise.resolve(true),
    ).finally(() => {
      // Обнуляем, только если это всё ещё наш запрос: после сброса там может быть новый.
      if (pendingLogout === attempt) pendingLogout = null
    })
    pendingLogout = attempt
  }
  return pendingLogout
}

async function restore(): Promise<void> {
  if (isLogoutPending()) {
    // Выход не завершён — вкладка намеренно гость, сбоя восстановления нет.
    restoreUnavailable = false
    await finishPendingLogout()
    return
  }
  const result = await refreshAccessToken()
  restoreUnavailable = result.status === 'unavailable'
  // Сеть недоступна — вкладка не гость: следующий запрос попробует восстановить сессию снова (БП §1).
  if (restoreUnavailable) restoring = null
}

/** Последнее восстановление сессии упало на сбое сети или сервера — вкладка не гость. */
export function isRestoreUnavailable(): boolean {
  return restoreUnavailable
}

/** БП §1: при загрузке страницы сначала обмен refresh-cookie на токен, потом запросы. */
export function ensureSession(): Promise<void> {
  if (getAccessToken()) return Promise.resolve()
  restoring ??= restore()
  return restoring
}

/**
 * Низкоуровневая установка токена новой сессии: метка выхода снимается, другие вкладки перечитают сессию.
 * Снаружи вызывать только через signInWith — он ставит запрос входа в очередь обмена. Экспортирована для тестов.
 */
export function signIn(token: string): void {
  generation += 1
  setAccessToken(token)
  setLogoutPending(false)
  restoring = Promise.resolve()
  restoreUnavailable = false
  tellOtherTabs({ type: 'signed-in' })
}

/**
 * Вход и регистрация (#29): запрос, выдающий новую сессию, идёт в общей очереди обмена токена.
 * Иначе ответ устаревшего обмена в другой вкладке перезапишет или сотрёт cookie новой сессии.
 * request не должен проходить через обмен токена в middleware (пути сессии: /auth/login, /auth/register):
 * Web Locks не реентерабельны, вложенный обмен заблокирует очередь. Смена пароля (#30) — reauthenticateWith.
 */
export async function signInWith<T extends { access_token: string }>(
  request: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  // Обмен этой вкладки, начатый раньше, свой результат не применит и закончится первым.
  generation += 1
  await refreshInFlight
  const result = await inRefreshQueue(async () => {
    // Выход без сети ещё не дошёл до сервера — доводим, иначе вход снимет метку, а старая сессия останется.
    if (isLogoutPending()) await finishLogout()
    // Таймаут считается от запроса, а не от ожидания очереди: зависший вход не держит обмен во всех вкладках.
    return request(AbortSignal.timeout(REQUEST_TIMEOUT_MS))
  })
  signIn(result.access_token)
  return result
}

/**
 * Смена пароля (#30): запрос с токеном выдаёт новую сессию, сервер отзывает остальные refresh-токены.
 * Идёт в общей очереди обмена, как signInWith, а обмен на 401 делается здесь же, под уже взятой блокировкой:
 * через middleware он встал бы в ту же очередь и заблокировал её. Поэтому request идёт мимо обмена в middleware
 * (путь в SESSION_PATHS клиента), токен передаётся заголовком.
 * Другим вкладкам ничего не сообщаем: их токены доживут своё, обмен пойдёт уже по новой cookie.
 */
export async function reauthenticateWith<T extends { access_token: string }>(
  request: (token: string, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  await ensureSession()
  // Обмен этой вкладки, начатый раньше, относится к той же сессии: даём ему закончиться, а не обесцениваем.
  await refreshInFlight
  const result = await inRefreshQueue(async () => {
    const token = getAccessToken()
    if (token) {
      try {
        return await request(token, AbortSignal.timeout(REQUEST_TIMEOUT_MS))
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) throw error
      }
    }
    const refreshed = await requestRefresh()
    if (refreshed.status === 'ok') return request(refreshed.token, AbortSignal.timeout(REQUEST_TIMEOUT_MS))
    if (refreshed.status === 'unavailable') throw new NetworkError()
    endSession()
    throw new ApiError(401, 'Сессия истекла')
  })
  generation += 1
  setAccessToken(result.access_token)
  restoring = Promise.resolve()
  restoreUnavailable = false
  return result
}

/** Выход: метка ставится до запроса, чтобы другие вкладки сразу перестали обновлять токен. */
export async function signOut(): Promise<{ serverConfirmed: boolean }> {
  setLogoutPending(true)
  generation += 1
  let serverConfirmed = false
  try {
    // Обмен, начатый до выхода, сначала заканчивается: logout отзовёт самую свежую cookie.
    await refreshInFlight
    serverConfirmed = await inRefreshQueue(finishLogout)
  } finally {
    // Локальный выход завершаем всегда, даже если очередь или сеть подвели.
    setAccessToken(null)
    restoring = Promise.resolve()
    restoreUnavailable = false
    tellOtherTabs({ type: 'signed-out' })
    emit({ type: 'signed-out', serverConfirmed })
  }
  return { serverConfirmed }
}

/** Сервер отказал в обмене токена на запросе с токеном: сессия закончилась. */
export function endSession(): void {
  setAccessToken(null)
  // Параллельные запросы с одним истёкшим токеном вызывают это по очереди — сообщаем один раз.
  if (expiredIn === generation) return
  expiredIn = generation
  emit({ type: 'expired' })
}

/** Временный пароль не сменён (Контракты, 403 password_change_required): SessionEvents уведёт на /change-password. */
export function requirePasswordChange(): void {
  emit({ type: 'password-change-required' })
}

if (typeof window !== 'undefined') {
  // Связь вернулась — доводим выход, начатый без сети.
  window.addEventListener('online', () => void finishPendingLogout())
}

/** Сбрасывает состояние модуля между тестами. */
export function resetSessionForTests(): void {
  restoring = null
  refreshInFlight = null
  pendingLogout = null
  restoreUnavailable = false
  expiredIn = -1
  generation += 1
  listeners.clear()
  channel?.close()
  channel = openChannel()
  setAccessToken(null)
}
