import type { Role, User } from '../api/schema'

/** Пароль всех seed-аккаунтов моков. */
export const SEED_PASSWORD = 'pawchito1'

/** Задержка ответа /auth/refresh: в браузере видна гонка вкладок, в тестах набор не тормозит. */
export const DEFAULT_REFRESH_DELAY_MS = import.meta.env.MODE === 'test' ? 0 : 300

export interface MockAccount {
  id: number
  email: string
  password: string
  role: Role
  full_name: string
  must_change_password: boolean
  is_active: boolean
  recovery_code: string | null
}

export interface MockServerState {
  accounts: MockAccount[]
  nextUserId: number
  refreshTokens: Record<string, { userId: number; revoked: boolean }>
  /** Ключ — email в нижнем регистре. */
  attempts: Record<string, { failures: number; lockedUntil: number | null }>
  accessEpoch: number
  network: boolean
  refreshDelayMs: number
}

const SERVER_KEY = 'pawchito:mock-server'
const COOKIE_KEY = 'pawchito:mock-cookie'
const ACCESS_TTL_SECONDS = 900
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

function seedAccount(
  id: number,
  email: string,
  role: Role,
  fullName: string,
  extra: Partial<MockAccount> = {},
): MockAccount {
  return {
    id,
    email,
    password: SEED_PASSWORD,
    role,
    full_name: fullName,
    must_change_password: false,
    is_active: true,
    recovery_code: null,
    ...extra,
  }
}

export function seedState({ refreshDelayMs = DEFAULT_REFRESH_DELAY_MS }: { refreshDelayMs?: number } = {}): MockServerState {
  return {
    accounts: [
      seedAccount(1, 'owner@example.com', 'owner', 'Анна Смирнова', { recovery_code: 'K7QM-2XPA-9RTD-4WNB' }),
      seedAccount(6, 'clinic@example.com', 'clinic', 'ВетДоктор'),
      seedAccount(7, 'clinic-new@example.com', 'clinic', 'Клиника «Новая»', { must_change_password: true }),
      seedAccount(9, 'admin@example.com', 'admin', 'Администратор'),
      seedAccount(12, 'blocked@example.com', 'owner', 'Иван Петров', { is_active: false }),
    ],
    nextUserId: 100,
    refreshTokens: {},
    attempts: {},
    accessEpoch: 1,
    network: true,
    refreshDelayMs,
  }
}

/** Состояние «сервера» общее для вкладок: MSW отвечает в каждой вкладке отдельно. */
export function readServer(): MockServerState {
  try {
    const saved = localStorage.getItem(SERVER_KEY)
    if (saved) return JSON.parse(saved) as MockServerState
  } catch {
    // повреждённое состояние — начинаем с seed
  }
  const state = seedState()
  writeServer(state)
  return state
}

export function writeServer(state: MockServerState): void {
  try {
    localStorage.setItem(SERVER_KEY, JSON.stringify(state))
  } catch {
    // хранилище недоступно — состояние не сохранится между запросами
  }
}

/** Прочитать состояние, изменить и сохранить; возвращает результат изменения. */
export function updateServer<T>(change: (state: MockServerState) => T): T {
  const state = readServer()
  const result = change(state)
  writeServer(state)
  return result
}

/** Заменитель HttpOnly-cookie refresh_token: её читают только моки, не код приложения. */
export function readMockCookie(): string | null {
  try {
    return localStorage.getItem(COOKIE_KEY)
  } catch {
    return null
  }
}

export function writeMockCookie(token: string | null): void {
  try {
    if (token === null) localStorage.removeItem(COOKIE_KEY)
    else localStorage.setItem(COOKIE_KEY, token)
  } catch {
    // хранилище недоступно — «браузер» без cookie
  }
}

export function findAccount(state: MockServerState, email: string): MockAccount | undefined {
  const wanted = email.trim().toLowerCase()
  return state.accounts.find((account) => account.email.toLowerCase() === wanted)
}

export function toUser({ id, email, role, full_name, must_change_password }: MockAccount): User {
  return { id, email, role, full_name, must_change_password }
}

function randomPart(): string {
  return Math.random().toString(36).slice(2, 12)
}

export function issueRefreshToken(state: MockServerState, userId: number): string {
  const token = `mock-refresh.${randomPart()}${randomPart()}`
  state.refreshTokens[token] = { userId, revoked: false }
  return token
}

export function revokeUserTokens(state: MockServerState, userId: number): void {
  for (const record of Object.values(state.refreshTokens)) {
    if (record.userId === userId) record.revoked = true
  }
}

/** Тело ответа Token; access-токен действует, пока не сменилась эпоха. */
export function tokenBody(state: MockServerState, account: MockAccount) {
  return {
    access_token: `mock-access.${account.id}.${state.accessEpoch}`,
    token_type: 'bearer' as const,
    expires_in: ACCESS_TTL_SECONDS,
  }
}

export function accountFromAuthorization(state: MockServerState, header: string | null): MockAccount | null {
  const match = /^Bearer mock-access\.(\d+)\.(\d+)$/.exec(header ?? '')
  if (!match || Number(match[2]) !== state.accessEpoch) return null
  return state.accounts.find((account) => account.id === Number(match[1])) ?? null
}

/** Код восстановления: 16 символов A–Z0–9 в формате XXXX-XXXX-XXXX-XXXX. */
export function newRecoveryCode(): string {
  const group = () =>
    Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('')
  return [group(), group(), group(), group()].join('-')
}
