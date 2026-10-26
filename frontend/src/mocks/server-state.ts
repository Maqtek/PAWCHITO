import type {
  AdminClinic,
  Appointment,
  AppointmentOutcome,
  AppointmentReason,
  AppointmentStatus,
  CancelledBy,
  Condition,
  ConditionCreate,
  NotificationType,
  Observation,
  Pet,
  Prescription,
  Reminder,
  Role,
  User,
  Vaccination,
  VaccinationCreate,
  Vet,
} from '../api/schema'
import { addDays, isoWeekday, moscowDateTime, toMoscowString } from '../lib/dates'
import { moscowIsoDate } from '../lib/format'
import { careStatusLabel } from '../lib/labels'
import { clinicDayLink, noticeText } from './notification-texts'
import { normalizeText } from './text-validation'

/** Пароль всех seed-аккаунтов моков. */
export const SEED_PASSWORD = 'pawchito1'

/** Задержка ответа /auth/refresh: в браузере видна гонка вкладок, в тестах набор не тормозит. */
const DEFAULT_REFRESH_DELAY_MS = import.meta.env.MODE === 'test' ? 0 : 300

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

/** Дело в состоянии моков: is_overdue не хранится — считается в момент ответа (Р-60). */
export type MockReminder = Omit<Reminder, 'is_overdue'>

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
  /** Рецепты хранятся в итоге записи; номер — общий на все итоги. */
  nextPrescriptionId: number
  /** Дела всех питомцев; владелец видит только дела своих — по pet_id. */
  reminders: MockReminder[]
  nextReminderId: number
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

type AccountFields = Pick<MockAccount, 'id' | 'email' | 'password' | 'role'> & Partial<MockAccount>

/** Аккаунт: активен, без временного пароля и кода восстановления; full_name у клиники пустое (Р-35). */
export function newAccount(fields: AccountFields): MockAccount {
  return {
    full_name: '',
    must_change_password: false,
    is_active: true,
    recovery_code: null,
    clinic_id: null,
    ...fields,
  }
}

const seedAccount = (fields: Omit<AccountFields, 'password'>) => newAccount({ password: SEED_PASSWORD, ...fields })

/** Клиника: не скрыта, будущих записей в счётчике seed нет. */
export function newClinic(
  fields: Pick<MockClinic, 'id' | 'name' | 'address' | 'phone' | 'opens_at' | 'closes_at' | 'work_days'> & Partial<MockClinic>,
): MockClinic {
  return { archived_at: null, futureAppointments: 0, ...fields }
}

/** Врач: без специализации, не в отпуске, не в архиве. */
export function newVet(fields: Pick<Vet, 'id' | 'clinic_id' | 'full_name'> & Partial<Vet>): Vet {
  return { specialization: null, on_vacation: false, archived_at: null, ...fields }
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

type ObservationFields = Pick<Observation, 'id' | 'pet_id' | 'date' | 'source'> & Partial<Observation>

/** Наблюдение дневника: незаданные поля — null (Р-45). */
export function newObservation(fields: ObservationFields): Observation {
  return { weight: null, appetite: null, energy: null, symptoms: null, note: null, ...fields }
}

/** Новое наблюдение со следующим номером. */
export function addObservation(state: MockServerState, fields: Omit<ObservationFields, 'id'>): Observation {
  const observation = newObservation({ id: state.nextObservationId, ...fields })
  state.nextObservationId += 1
  state.observations.push(observation)
  return observation
}

/** Новая особенность здоровья из тела ConditionCreate: название без пробелов по краям, пустой комментарий — null. */
export function addCondition(
  state: MockServerState,
  { pet_id, kind, title, description, source }: ConditionCreate & Pick<Condition, 'pet_id' | 'source'>,
): Condition {
  const condition: Condition = {
    id: state.nextConditionId,
    pet_id,
    kind,
    title: title.trim(),
    description: normalizeText(description),
    source,
    archived_at: null,
  }
  state.nextConditionId += 1
  state.conditions.push(condition)
  return condition
}

/** Новая прививка из тела VaccinationCreate: название без пробелов по краям, без следующей — null. */
export function addVaccination(
  state: MockServerState,
  { pet_id, name, date, next_date, source, appointment_id }: VaccinationCreate &
    Pick<Vaccination, 'pet_id' | 'source' | 'appointment_id'>,
): Vaccination {
  const vaccination: Vaccination = {
    id: state.nextVaccinationId,
    pet_id,
    name: name.trim(),
    date,
    next_date: next_date ?? null,
    source,
    appointment_id,
  }
  state.nextVaccinationId += 1
  state.vaccinations.push(vaccination)
  return vaccination
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

/** Запись: заявка без комментариев и итога. */
export function newAppointment(
  fields: Pick<MockAppointment, 'id' | 'pet_id' | 'vet_id' | 'slot_start' | 'reason'> & Partial<MockAppointment>,
): MockAppointment {
  return {
    reason_comment: null,
    status: 'requested',
    cancelled_by: null,
    clinic_comment: null,
    outcome: null,
    ...fields,
  }
}

/** Записи к врачам «ВетДоктора» (клиника 2): Петров (4), Соколова (5, в отпуске), Ким (6). */
function seedAppointments(prescription: Prescription): MockAppointment[] {
  const at = (days: number, time: string) => moscowDateTime(seedDay(days), time)
  return [
    newAppointment({
      id: 20,
      pet_id: 10,
      vet_id: 4,
      slot_start: at(2, '10:00'),
      reason: 'vaccination',
      status: 'confirmed',
      reason_comment: 'Плановая от бешенства',
    }),
    newAppointment({ id: 21, pet_id: 10, vet_id: 6, slot_start: at(5, '15:30'), reason: 'follow_up' }),
    newAppointment({
      id: 22,
      pet_id: 10,
      vet_id: 4,
      slot_start: at(-16, '11:00'),
      reason: 'illness',
      status: 'completed',
      reason_comment: 'Хромает на заднюю лапу',
      outcome: {
        conclusion: 'Растяжение связок задней лапы',
        recommendations: 'Покой две недели, повторный приём через месяц',
        care_status: 'treatment',
        completed_at: at(-16, '11:40'),
        prescriptions: [prescription],
        vaccinations: [],
      },
    }),
    newAppointment({
      id: 23,
      pet_id: 10,
      vet_id: 5,
      slot_start: at(-5, '12:00'),
      reason: 'checkup',
      status: 'cancelled',
      cancelled_by: 'clinic',
      clinic_comment: 'Врач заболела, перезапишитесь, пожалуйста',
    }),
    newAppointment({ id: 24, pet_id: 11, vet_id: 6, slot_start: at(1, '09:00'), reason: 'checkup' }),
    // Запись чужого питомца: этот слот Петрова занят и для owner@example.com.
    newAppointment({ id: 25, pet_id: 13, vet_id: 4, slot_start: at(2, '10:30'), reason: 'checkup', status: 'confirmed' }),
  ]
}

/** Курс Майло после приёма №22: раз в день три недели с дня приёма — сейчас идёт последняя неделя. */
function seedPrescription(): Prescription {
  return { id: 1, drug: 'Мелоксикам', dosage: '1,5 мл', times: ['20:00'], duration_days: 21, start_date: seedDay(-16) }
}

/** Своё дело: запланировано; серия с повтором — по первому делу, следующие получат его id (Р-61). */
export function newCustomReminder(
  fields: Pick<MockReminder, 'id' | 'pet_id' | 'title' | 'category' | 'due_at' | 'repeat_interval_days'> &
    Partial<MockReminder>,
): MockReminder {
  return {
    source: 'custom',
    prescription_id: null,
    status: 'pending',
    done_at: null,
    series_id: fields.repeat_interval_days === null ? null : fields.id,
    ...fields,
  }
}

/**
 * Дела seed: курс Майло до позавчера выполнен (одна доза пропущена), вчерашняя доза просрочена, дальше запланировано;
 * свои дела — чистка зубов Майло раз в неделю (прошлая выполнена), корм на сегодня, капли от блох Барсику раз в месяц.
 */
function seedReminders(prescription: Prescription): MockReminder[] {
  const today = moscowIsoDate(new Date())
  const markedAfter = (dueAt: string) => toMoscowString(new Date(new Date(dueAt).getTime() + 15 * 60 * 1000))
  const course = courseDoses(prescription).map((dueAt, index): MockReminder => {
    const reminder = courseReminder(index + 1, 10, prescription, dueAt)
    if (dueAt.slice(0, 10) >= addDays(today, -1)) return reminder
    return { ...reminder, status: index === 10 ? 'skipped' : 'done', done_at: markedAfter(dueAt) }
  })
  const at = (days: number, time: string) => moscowDateTime(addDays(today, days), time)
  const brushing = { pet_id: 10, title: 'Почистить зубы', category: 'routine', repeat_interval_days: 7 } as const
  return [
    ...course,
    newCustomReminder({ ...brushing, id: 30, due_at: at(-6, '21:00'), status: 'done', done_at: markedAfter(at(-6, '21:00')) }),
    newCustomReminder({ ...brushing, id: 31, due_at: at(1, '21:00'), series_id: 30 }),
    newCustomReminder({
      id: 32,
      pet_id: 10,
      title: 'Купить корм',
      category: 'routine',
      due_at: at(0, '18:00'),
      repeat_interval_days: null,
    }),
    newCustomReminder({
      id: 33,
      pet_id: 11,
      title: 'Капли от блох',
      category: 'prevention',
      due_at: at(3, '10:00'),
      repeat_interval_days: 30,
    }),
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
  const prescription = seedPrescription()
  const appointments = seedAppointments(prescription)
  return {
    accounts: [
      seedAccount({ id: 1, email: 'owner@example.com', role: 'owner', full_name: 'Анна Смирнова', recovery_code: 'K7QM-2XPA-9RTD-4WNB' }),
      seedAccount({ id: 6, email: 'clinic@example.com', role: 'clinic', clinic_id: 2 }),
      seedAccount({ id: 7, email: 'clinic-new@example.com', role: 'clinic', clinic_id: 3, must_change_password: true }),
      seedAccount({ id: 8, email: 'aibolit@example.com', role: 'clinic', clinic_id: 5, is_active: false }),
      seedAccount({ id: 9, email: 'admin@example.com', role: 'admin', full_name: 'Администратор' }),
      seedAccount({ id: 12, email: 'blocked@example.com', role: 'owner', full_name: 'Иван Петров', is_active: false }),
    ],
    nextUserId: 100,
    clinics: [
      newClinic({
        id: 2,
        name: 'ВетДоктор',
        address: 'ул. Ленина, 10',
        phone: '+79990000000',
        opens_at: '09:00',
        closes_at: '20:00',
        work_days: [1, 2, 3, 4, 5, 6],
        futureAppointments: 7,
      }),
      newClinic({
        id: 3,
        name: 'Клиника «Новая»',
        address: 'пр. Мира, 5',
        phone: '+79991112233',
        opens_at: '10:00',
        closes_at: '19:00',
        work_days: [1, 2, 3, 4, 5],
      }),
      newClinic({
        id: 4,
        name: 'Зоовет',
        address: 'ул. Садовая, 21',
        phone: '+79993334455',
        opens_at: '08:00',
        closes_at: '22:00',
        work_days: [1, 2, 3, 4, 5, 6, 7],
      }),
      newClinic({
        id: 5,
        name: 'Айболит',
        address: 'ул. Чехова, 3',
        phone: '+79995556677',
        opens_at: '09:00',
        closes_at: '18:00',
        work_days: [1, 2, 3, 4, 5],
        archived_at: '2026-10-01T12:00:00+03:00',
      }),
    ],
    nextClinicId: 100,
    vets: [
      newVet({ id: 4, clinic_id: 2, full_name: 'Петров Павел Петрович', specialization: 'терапевт' }),
      newVet({ id: 5, clinic_id: 2, full_name: 'Соколова Мария Андреевна', specialization: 'хирург', on_vacation: true }),
      newVet({ id: 6, clinic_id: 2, full_name: 'Ким Елена Викторовна' }),
      newVet({
        id: 7,
        clinic_id: 2,
        full_name: 'Орлов Дмитрий Сергеевич',
        specialization: 'дерматолог',
        archived_at: '2026-09-15T12:00:00+03:00',
      }),
      // Врач другой клиники: clinic@example.com его не видит и не меняет (404).
      newVet({ id: 8, clinic_id: 4, full_name: 'Белова Ольга Игоревна', specialization: 'терапевт' }),
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
      // Внесена клиникой при итоге приёма; этого приёма в seed нет — номер условный.
      { id: 2, pet_id: 10, name: 'Нобивак DHPPi', date: '2026-10-10', next_date: '2027-10-10', source: 'clinic', appointment_id: 501 },
      // Следующая уже прошла — прививка просрочена (Р-46).
      { id: 3, pet_id: 11, name: 'Нобивак Tricat Trio', date: '2025-06-01', next_date: '2026-06-01', source: 'owner', appointment_id: null },
      { id: 4, pet_id: 13, name: 'Нобивак Rabies', date: '2026-03-01', next_date: null, source: 'owner', appointment_id: null },
    ],
    nextVaccinationId: 100,
    appointments,
    nextAppointmentId: 100,
    nextPrescriptionId: 100,
    reminders: seedReminders(prescription),
    nextReminderId: 100,
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

/** Дозы курса: каждое время каждого дня рецепта, по порядку (БП §6.2). */
function courseDoses(prescription: Prescription): string[] {
  const doses: string[] = []
  for (let day = 0; day < prescription.duration_days; day += 1) {
    const date = addDays(prescription.start_date, day)
    for (const time of prescription.times) doses.push(moscowDateTime(date, time))
  }
  return doses
}

/** Дело курса: название — «препарат, дозировка», тип — «Лечение», без повтора (Р-63). */
function courseReminder(id: number, petId: number, prescription: Prescription, dueAt: string): MockReminder {
  return {
    id,
    pet_id: petId,
    source: 'prescription',
    prescription_id: prescription.id,
    title: `${prescription.drug}, ${prescription.dosage}`,
    category: 'treatment',
    due_at: dueAt,
    status: 'pending',
    done_at: null,
    repeat_interval_days: null,
    series_id: null,
  }
}

/** Дела курса на дозы, время которых ещё не прошло (БП §6.2); возвращает, сколько создано. */
export function addCourseReminders(state: MockServerState, petId: number, prescription: Prescription, now: Date): number {
  const doses = courseDoses(prescription).filter((dueAt) => new Date(dueAt).getTime() > now.getTime())
  for (const dueAt of doses) {
    state.reminders.push(courseReminder(state.nextReminderId, petId, prescription, dueAt))
    state.nextReminderId += 1
  }
  return doses.length
}

/** Дело для ответа: просрочено, если запланировано, а время прошло (Р-60). */
export function toReminder(reminder: MockReminder, now = new Date()): Reminder {
  return { ...reminder, is_overdue: reminder.status === 'pending' && new Date(reminder.due_at).getTime() < now.getTime() }
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
