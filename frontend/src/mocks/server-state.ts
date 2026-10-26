import type { AdminClinic, Role, User, Vet } from '../api/schema'

/** Пароль всех seed-аккаунтов моков. */
export const SEED_PASSWORD = 'pawchito1'

/** Задержка ответа /auth/refresh: в браузере видна гонка вкладок, в тестах набор не тормозит. */
export const DEFAULT_REFRESH_DELAY_MS = import.meta.env.MODE === 'test' ? 0 : 300

export interface MockAccount {
  id: number
  email: string
  password: string
  role: Role
  /** У клиники пустое: её имя — название клиники, его подставляет toUser (Р-35). */
  full_name: string
  must_change_password: boolean
  is_active: boolean
  recovery_code: string | null
  /** Клиника аккаунта; у владельцев и админов — null. */
  clinic_id: number | null
}

export interface MockClinic {
  id: number
  name: string
  address: string
  phone: string
  opens_at: string
  closes_at: string
  work_days: number[]
  archived_at: string | null
  /** Записей в моках нет до этапа 7: число будущих записей хранится в клинике. */
  futureAppointments: number
}

export interface MockServerState {
  accounts: MockAccount[]
  nextUserId: number
  clinics: MockClinic[]
  nextClinicId: number
  /** Врачи всех клиник; клиника видит только своих — по clinic_id аккаунта. */
  vets: Vet[]
  nextVetId: number
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
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'

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
    clinic_id: null,
    ...extra,
  }
}

function seedClinic(
  id: number,
  name: string,
  address: string,
  phone: string,
  opensAt: string,
  closesAt: string,
  workDays: number[],
  extra: Partial<MockClinic> = {},
): MockClinic {
  return {
    id,
    name,
    address,
    phone,
    opens_at: opensAt,
    closes_at: closesAt,
    work_days: workDays,
    archived_at: null,
    futureAppointments: 0,
    ...extra,
  }
}

function seedVet(id: number, clinicId: number, fullName: string, specialization: string | null, extra: Partial<Vet> = {}): Vet {
  return {
    id,
    clinic_id: clinicId,
    full_name: fullName,
    specialization,
    on_vacation: false,
    archived_at: null,
    ...extra,
  }
}

export function seedState({ refreshDelayMs = DEFAULT_REFRESH_DELAY_MS }: { refreshDelayMs?: number } = {}): MockServerState {
  return {
    accounts: [
      seedAccount(1, 'owner@example.com', 'owner', 'Анна Смирнова', { recovery_code: 'K7QM-2XPA-9RTD-4WNB' }),
      seedAccount(6, 'clinic@example.com', 'clinic', '', { clinic_id: 2 }),
      seedAccount(7, 'clinic-new@example.com', 'clinic', '', { clinic_id: 3, must_change_password: true }),
      seedAccount(8, 'aibolit@example.com', 'clinic', '', { clinic_id: 5, is_active: false }),
      seedAccount(9, 'admin@example.com', 'admin', 'Администратор'),
      seedAccount(12, 'blocked@example.com', 'owner', 'Иван Петров', { is_active: false }),
    ],
    nextUserId: 100,
    clinics: [
      seedClinic(2, 'ВетДоктор', 'ул. Ленина, 10', '+79990000000', '09:00', '20:00', [1, 2, 3, 4, 5, 6], { futureAppointments: 7 }),
      seedClinic(3, 'Клиника «Новая»', 'пр. Мира, 5', '+79991112233', '10:00', '19:00', [1, 2, 3, 4, 5]),
      seedClinic(4, 'Зоовет', 'ул. Садовая, 21', '+79993334455', '08:00', '22:00', [1, 2, 3, 4, 5, 6, 7]),
      seedClinic(5, 'Айболит', 'ул. Чехова, 3', '+79995556677', '09:00', '18:00', [1, 2, 3, 4, 5], {
        archived_at: '2026-10-01T12:00:00+03:00',
      }),
    ],
    nextClinicId: 100,
    vets: [
      seedVet(4, 2, 'Петров Павел Петрович', 'терапевт'),
      seedVet(5, 2, 'Соколова Мария Андреевна', 'хирург', { on_vacation: true }),
      seedVet(6, 2, 'Ким Елена Викторовна', null),
      seedVet(7, 2, 'Орлов Дмитрий Сергеевич', 'дерматолог', { archived_at: '2026-09-15T12:00:00+03:00' }),
      // Врач другой клиники: clinic@example.com его не видит и не меняет (404).
      seedVet(8, 4, 'Белова Ольга Игоревна', 'терапевт'),
    ],
    nextVetId: 100,
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
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<MockServerState>
      // Состояние до этапа 3: без клиник у аккаунтов клиник нет clinic_id — начинаем с seed.
      // Новые поля состояния берутся из seed — сохранённое старое состояние не ломает моки.
      if (Array.isArray(parsed.clinics)) return { ...seedState(), ...parsed }
    }
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

/** Ключ счётчика неудачных попыток: один для входа, восстановления и сброса пароля администратором. */
export const attemptsKey = (email: string) => email.trim().toLowerCase()

export function findAccount(state: MockServerState, email: string): MockAccount | undefined {
  const wanted = email.trim().toLowerCase()
  return state.accounts.find((account) => account.email.toLowerCase() === wanted)
}

/** Ответ AdminClinic: аккаунт — по clinic_id, число будущих записей — из клиники. */
export function toAdminClinic(state: MockServerState, clinic: MockClinic): AdminClinic {
  const { futureAppointments, ...fields } = clinic
  const account = state.accounts.find((item) => item.clinic_id === clinic.id)
  return {
    ...fields,
    account: account ? { id: account.id, email: account.email, is_active: account.is_active } : null,
    future_appointments_count: futureAppointments,
  }
}

/** Ответ User: имя клиники берётся из клиники при каждом ответе, поэтому после переименования не расходится (Р-35). */
export function toUser(state: MockServerState, account: MockAccount): User {
  const { id, email, role, full_name, must_change_password } = account
  const clinic = role === 'clinic' ? state.clinics.find((item) => item.id === account.clinic_id) : undefined
  return { id, email, role, full_name: clinic?.name ?? full_name, must_change_password }
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

/** Временный пароль клиники xxxx-xxxx-xxxx: без похожих символов (0/O, 1/l/I), чтобы его можно было продиктовать. */
export function newTemporaryPassword(): string {
  const group = () =>
    Array.from({ length: 4 }, () => PASSWORD_ALPHABET[Math.floor(Math.random() * PASSWORD_ALPHABET.length)]).join('')
  return [group(), group(), group()].join('-')
}
