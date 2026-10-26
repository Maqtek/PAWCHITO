import type {
  AdminClinic,
  Appointment,
  AppointmentOutcome,
  AppointmentReason,
  AppointmentStatus,
  CancelledBy,
  Condition,
  NotificationType,
  Observation,
  Pet,
  Role,
  User,
  Vaccination,
  Vet,
} from '../api/schema'
import { addDays, isoWeekday, moscowDateTime, toMoscowString } from '../lib/dates'
import { moscowIsoDate } from '../lib/format'
import { careStatusLabel } from '../lib/labels'
import { clinicDayLink, noticeText } from './notification-texts'

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
  /**
   * Число будущих записей для админки — счётчик seed, на нём держатся тесты этапа 3. Настоящие записи (этап 7) он не
   * учитывает, но при скрытии клиники они тоже отменяются.
   */
  futureAppointments: number
}

/** Запись в моках: ссылки по id, клички и имена подставляет toAppointment — после переименования не расходятся. */
export interface MockAppointment {
  id: number
  pet_id: number
  vet_id: number
  /** Со смещением +03:00, как отдаёт сервер. */
  slot_start: string
  reason: AppointmentReason
  reason_comment: string | null
  status: AppointmentStatus
  cancelled_by: CancelledBy | null
  clinic_comment: string | null
  outcome: AppointmentOutcome | null
}

/** Уведомление аккаунта: владельца или клиники (БП §9). */
export interface MockNotification {
  id: number
  user_id: number
  type: NotificationType
  text: string
  link: string
  created_at: string
  read_at: string | null
}

export interface MockServerState {
  accounts: MockAccount[]
  nextUserId: number
  clinics: MockClinic[]
  nextClinicId: number
  /** Врачи всех клиник; клиника видит только своих — по clinic_id аккаунта. */
  vets: Vet[]
  nextVetId: number
  /** Питомцы всех владельцев; владелец видит только своих — по owner_id. */
  pets: Pet[]
  nextPetId: number
  /** Записи здоровья всех питомцев; владелец видит только записи своих — по pet_id. */
  conditions: Condition[]
  nextConditionId: number
  observations: Observation[]
  nextObservationId: number
  vaccinations: Vaccination[]
  nextVaccinationId: number
  /** Записи к врачу всех владельцев; владелец видит только записи своих питомцев. */
  appointments: MockAppointment[]
  nextAppointmentId: number
  notifications: MockNotification[]
  nextNotificationId: number
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

/** Наблюдение дневника: незаданные поля — null (Р-45). */
export function newObservation(
  fields: Pick<Observation, 'id' | 'pet_id' | 'date' | 'source'> & Partial<Observation>,
): Observation {
  return { weight: null, appetite: null, energy: null, symptoms: null, note: null, ...fields }
}

/** Новый питомец: без фото и статуса ухода — их ставит только клиника (БП §6.3, §6.4). */
export function newPet(fields: Pick<Pet, 'id' | 'owner_id' | 'name' | 'species'> & Partial<Pet>): Pet {
  return {
    breed: null,
    birth_date: null,
    sex: 'unknown',
    photo_url: null,
    care_status: null,
    care_status_set_at: null,
    care_status_clinic: null,
    archived_at: null,
    ...fields,
  }
}

/**
 * День seed-записи — через days дней от сегодня по Москве: seed пересоздаётся при сбросе моков, и предстоящие записи
 * не уходят в прошлое. Воскресенье — выходной «ВетДоктора»: такой день сдвигается дальше от сегодня.
 */
function seedDay(days: number): string {
  let date = addDays(moscowIsoDate(new Date()), days)
  while (isoWeekday(date) === 7) date = addDays(date, days < 0 ? -1 : 1)
  return date
}

function seedAppointment(
  id: number,
  petId: number,
  vetId: number,
  date: string,
  time: string,
  reason: AppointmentReason,
  extra: Partial<MockAppointment> = {},
): MockAppointment {
  return {
    id,
    pet_id: petId,
    vet_id: vetId,
    slot_start: moscowDateTime(date, time),
    reason,
    reason_comment: null,
    status: 'requested',
    cancelled_by: null,
    clinic_comment: null,
    outcome: null,
    ...extra,
  }
}

/** Записи к врачам «ВетДоктора» (клиника 2): Петров (4), Соколова (5, в отпуске), Ким (6). */
function seedAppointments(): MockAppointment[] {
  return [
    seedAppointment(20, 10, 4, seedDay(2), '10:00', 'vaccination', {
      status: 'confirmed',
      reason_comment: 'Плановая от бешенства',
    }),
    seedAppointment(21, 10, 6, seedDay(5), '15:30', 'follow_up'),
    seedAppointment(22, 10, 4, seedDay(-16), '11:00', 'illness', {
      status: 'completed',
      reason_comment: 'Хромает на заднюю лапу',
      outcome: {
        conclusion: 'Растяжение связок задней лапы',
        recommendations: 'Покой две недели, повторный приём через месяц',
        care_status: 'treatment',
        completed_at: moscowDateTime(seedDay(-16), '11:40'),
        prescriptions: [],
        vaccinations: [],
      },
    }),
    seedAppointment(23, 10, 5, seedDay(-5), '12:00', 'checkup', {
      status: 'cancelled',
      cancelled_by: 'clinic',
      clinic_comment: 'Врач заболела, перезапишитесь, пожалуйста',
    }),
    seedAppointment(24, 11, 6, seedDay(1), '09:00', 'checkup'),
    // Запись чужого питомца: этот слот Петрова занят и для owner@example.com.
    seedAppointment(25, 13, 4, seedDay(2), '10:30', 'checkup', { status: 'confirmed' }),
  ]
}

/**
 * Уведомления по seed-записям: у владельца три непрочитанных и два прочитанных, у «ВетДоктора» — две заявки
 * непрочитанные и одна прочитанная. Время — часы назад от сегодня, как и сами записи.
 */
function seedNotifications(appointments: MockAppointment[]): MockNotification[] {
  const slot = (id: number) => appointments.find((item) => item.id === id)?.slot_start ?? ''
  const hoursAgo = (hours: number) => toMoscowString(new Date(Date.now() - hours * 60 * 60 * 1000))
  const notice = (
    id: number,
    userId: number,
    type: NotificationType,
    text: string,
    link: string,
    hours: number,
    read = false,
  ): MockNotification => ({ id, user_id: userId, type, text, link, created_at: hoursAgo(hours), read_at: read ? hoursAgo(hours / 2) : null })
  return [
    notice(1, 1, 'appointment_cancelled_by_clinic', noticeText.cancelledByClinic('ВетДоктор', 'Майло', slot(23), 'Врач заболела, перезапишитесь, пожалуйста'), '/appointments/23', 30),
    notice(2, 1, 'outcome_added', noticeText.outcomeAdded('Майло', careStatusLabel.treatment), '/appointments/22', 20, true),
    notice(3, 1, 'appointment_confirmed', noticeText.confirmed('ВетДоктор', 'Майло', slot(20), 'Петров Павел Петрович'), '/appointments/20', 5),
    notice(4, 1, 'appointment_confirmed', noticeText.confirmed('ВетДоктор', 'Майло', slot(22), 'Петров Павел Петрович'), '/appointments/22', 400, true),
    notice(5, 1, 'outcome_added', noticeText.outcomeAdded('Майло', careStatusLabel.treatment), '/appointments/22', 2),
    notice(6, 6, 'appointment_requested', noticeText.requested('Майло', slot(20), 'Петров Павел Петрович'), clinicDayLink(slot(20)), 50, true),
    notice(7, 6, 'appointment_requested', noticeText.requested('Майло', slot(21), 'Ким Елена Викторовна'), clinicDayLink(slot(21)), 4),
    notice(8, 6, 'appointment_requested', noticeText.requested('Барсик', slot(24), 'Ким Елена Викторовна'), clinicDayLink(slot(24)), 1),
  ]
}

export function seedState({ refreshDelayMs = DEFAULT_REFRESH_DELAY_MS }: { refreshDelayMs?: number } = {}): MockServerState {
  const appointments = seedAppointments()
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
    pets: [
      newPet({
        id: 10,
        owner_id: 1,
        name: 'Майло',
        species: 'dog',
        breed: 'Золотистый ретривер',
        birth_date: '2022-05-01',
        sex: 'male',
        care_status: 'treatment',
        care_status_set_at: '2026-10-10T10:40:00+03:00',
        care_status_clinic: { id: 2, name: 'ВетДоктор' },
      }),
      newPet({ id: 11, owner_id: 1, name: 'Барсик', species: 'cat', breed: 'Британская короткошёрстная', birth_date: '2025-03-14', sex: 'male' }),
      // В архиве: в списках владельца его нет (Р-40).
      newPet({ id: 12, owner_id: 1, name: 'Кеша', species: 'other', breed: 'Волнистый попугай', archived_at: '2026-09-01T12:00:00+03:00' }),
      // Питомец другого владельца: owner@example.com его не видит и не меняет (404).
      newPet({ id: 13, owner_id: 12, name: 'Рекс', species: 'dog' }),
    ],
    nextPetId: 100,
    // Записи клиники (source: clinic) владелец только видит (Р-47). Рекс — питомец другого владельца.
    conditions: [
      { id: 1, pet_id: 10, kind: 'allergy', title: 'Аллергия на курицу', description: 'Сыпь и зуд после корма с курицей', source: 'owner', archived_at: null },
      { id: 2, pet_id: 10, kind: 'chronic', title: 'Дисплазия тазобедренных суставов', description: 'Лёгкая степень, нагрузку дозировать', source: 'clinic', archived_at: null },
      { id: 3, pet_id: 10, kind: 'allergy', title: 'Аллергия на блох', description: null, source: 'owner', archived_at: '2026-06-01T12:00:00+03:00' },
      { id: 4, pet_id: 13, kind: 'chronic', title: 'Артрит', description: null, source: 'owner', archived_at: null },
    ],
    nextConditionId: 100,
    observations: [
      // Вес с приёма в «ВетДокторе» (БП §3).
      newObservation({ id: 1, pet_id: 10, date: '2026-10-10', weight: 31.5, source: 'clinic' }),
      newObservation({
        id: 2,
        pet_id: 10,
        date: '2026-10-20',
        appetite: 'low',
        energy: 'low',
        symptoms: 'Хромает на заднюю лапу после прогулки',
        source: 'owner',
      }),
      newObservation({ id: 3, pet_id: 10, date: '2026-10-24', weight: 31.2, appetite: 'normal', energy: 'normal', note: 'Гуляли час, бодрый', source: 'owner' }),
      newObservation({ id: 4, pet_id: 11, date: '2026-10-22', appetite: 'normal', note: 'Спит больше обычного', source: 'owner' }),
      newObservation({ id: 5, pet_id: 13, date: '2026-10-21', weight: 28, source: 'owner' }),
    ],
    nextObservationId: 100,
    vaccinations: [
      { id: 1, pet_id: 10, name: 'Нобивак Rabies', date: '2026-01-15', next_date: '2027-01-15', source: 'owner', appointment_id: null },
      // Внесена клиникой при итоге приёма; приёмов в моках нет до этапа 9 — номер условный.
      { id: 2, pet_id: 10, name: 'Нобивак DHPPi', date: '2026-10-10', next_date: '2027-10-10', source: 'clinic', appointment_id: 501 },
      // Следующая уже прошла — прививка просрочена (Р-46).
      { id: 3, pet_id: 11, name: 'Нобивак Tricat Trio', date: '2025-06-01', next_date: '2026-06-01', source: 'owner', appointment_id: null },
      { id: 4, pet_id: 13, name: 'Нобивак Rabies', date: '2026-03-01', next_date: null, source: 'owner', appointment_id: null },
    ],
    nextVaccinationId: 100,
    appointments,
    nextAppointmentId: 100,
    notifications: seedNotifications(appointments),
    nextNotificationId: 100,
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
/**
 * Отмена системой (БП §5): записи «Заявка» и «Подтверждена», которые ещё не начались, — при архиве питомца и скрытии
 * клиники (Р-51). Возвращает отменённые записи: по ним уходят уведомления.
 */
export function cancelFutureAppointments(
  state: MockServerState,
  matches: (appointment: MockAppointment) => boolean,
  now = new Date(),
): MockAppointment[] {
  const future = state.appointments.filter(
    (item) =>
      (item.status === 'requested' || item.status === 'confirmed') &&
      new Date(item.slot_start).getTime() > now.getTime() &&
      matches(item),
  )
  for (const appointment of future) {
    appointment.status = 'cancelled'
    appointment.cancelled_by = 'system'
  }
  return future
}

/** Ответ Appointment: клиника — по врачу, клички и имена — текущие (Р-50). */
export function toAppointment(state: MockServerState, appointment: MockAppointment): Appointment {
  const { pet_id, vet_id, ...fields } = appointment
  const pet = state.pets.find((item) => item.id === pet_id)
  const vet = state.vets.find((item) => item.id === vet_id)
  const clinic = state.clinics.find((item) => item.id === vet?.clinic_id)
  const start = new Date(appointment.slot_start)
  return {
    ...fields,
    pet: { id: pet_id, name: pet?.name ?? '' },
    clinic: { id: clinic?.id ?? 0, name: clinic?.name ?? '' },
    vet: { id: vet_id, full_name: vet?.full_name ?? '' },
    slot_end: moscowSlotEnd(start),
  }
}

/** Конец слота — через 30 минут, в том же виде со смещением +03:00. */
function moscowSlotEnd(start: Date): string {
  return toMoscowString(new Date(start.getTime() + 30 * 60 * 1000))
}

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
