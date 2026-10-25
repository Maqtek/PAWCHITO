import { getAccessToken, setAccessToken } from './auth-token'
import { apiBaseUrl } from './base-url'

export type RefreshResult =
  | { status: 'ok'; token: string }
  /** Сервер ответил 401 или стоит метка выхода. */
  | { status: 'signed-out' }
  /** Нет сети, таймаут или 5xx: сессию не завершаем. */
  | { status: 'unavailable' }

export type SessionEvent =
  /** Сессия была и закончилась: refresh вернул 401. */
  | { type: 'expired' }
  | { type: 'signed-out'; serverConfirmed: boolean }
  | { type: 'signed-out-elsewhere' }
  | { type: 'signed-in-elsewhere' }

type TabMessage = { type: 'signed-in' } | { type: 'signed-out' }

const LOGOUT_PENDING_KEY = 'pawchito:logout-pending'
const REFRESH_LOCK = 'pawchito:refresh'
const CHANNEL_NAME = 'pawchito:session'
const REQUEST_TIMEOUT_MS = 10_000

let restoring: Promise<void> | null = null
let refreshInFlight: Promise<RefreshResult> | null = null
let restoreUnavailable = false
/** Растёт при каждом входе и выходе в этой или другой вкладке: обмен, начатый раньше, свой результат не применяет. */
let generation = 0
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
  opened.onmessage = (event: MessageEvent<TabMessage>) => {
    generation += 1
    setAccessToken(null)
    if (event.data.type === 'signed-out') {
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

async function exchangeCookie(): Promise<RefreshResult> {
  try {
    const response = await postAuth('/auth/refresh')
    if (response.ok) {
      const { access_token: token } = (await response.json()) as { access_token: string }
      return { status: 'ok', token }
    }
    return response.status === 401 ? { status: 'signed-out' } : { status: 'unavailable' }
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
  return 'locks' in navigator ? navigator.locks.request(REFRESH_LOCK, task) : task()
}

/** Обменивает refresh-cookie на access-токен. Параллельные вызовы вкладки ждут один запрос. */
export function refreshAccessToken(): Promise<RefreshResult> {
  if (isLogoutPending()) return Promise.resolve({ status: 'signed-out' })
  refreshInFlight ??= inRefreshQueue(requestRefresh).finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

/** Отзывает refresh-токен на сервере. true — сервер подтвердил (401 тоже: сессии уже нет). */
async function finishLogout(): Promise<boolean> {
  try {
    const response = await postAuth('/auth/logout')
    const confirmed = response.ok || response.status === 401
    if (confirmed) setLogoutPending(false)
    return confirmed
  } catch {
    return false
  }
}

async function restore(): Promise<void> {
  if (isLogoutPending()) {
    // Выход не завершён — вкладка намеренно гость, сбоя восстановления нет.
    restoreUnavailable = false
    await finishLogout()
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

/** Вход, регистрация, смена пароля (#29, #30): токен получен, другие вкладки перечитают сессию. */
export function signIn(token: string): void {
  generation += 1
  setAccessToken(token)
  setLogoutPending(false)
  restoring = Promise.resolve()
  restoreUnavailable = false
  tellOtherTabs({ type: 'signed-in' })
}

/** Выход: метка ставится до запроса, чтобы другие вкладки сразу перестали обновлять токен. */
export async function signOut(): Promise<{ serverConfirmed: boolean }> {
  setLogoutPending(true)
  generation += 1
  // Обмен, начатый до выхода, сначала заканчивается: logout отзовёт самую свежую cookie.
  await refreshInFlight
  const serverConfirmed = await inRefreshQueue(finishLogout)
  setAccessToken(null)
  restoring = Promise.resolve()
  restoreUnavailable = false
  tellOtherTabs({ type: 'signed-out' })
  emit({ type: 'signed-out', serverConfirmed })
  return { serverConfirmed }
}

/** Refresh вернул 401 на запросе с токеном: сессия закончилась. */
export function endSession(): void {
  setAccessToken(null)
  emit({ type: 'expired' })
}

if (typeof window !== 'undefined') {
  // Связь вернулась — доводим выход, начатый без сети.
  window.addEventListener('online', () => {
    if (isLogoutPending()) void finishLogout()
  })
}

/** Сбрасывает состояние модуля между тестами. */
export function resetSessionForTests(): void {
  restoring = null
  refreshInFlight = null
  restoreUnavailable = false
  generation += 1
  listeners.clear()
  channel?.close()
  channel = openChannel()
  setAccessToken(null)
}
