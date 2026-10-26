import { pluralize } from '../lib/format'
import { ApiError, isNetworkError } from './errors'

/** Где случилась ошибка: от этого зависит текст для 400–409. */
export type ErrorContext =
  | 'login'
  | 'register'
  | 'recover'
  | 'change-password'
  | 'recovery-code'
  | 'profile'
  | 'clinic'
  | 'clinic-account'
  | 'vet'
  | 'pet'
  | 'health'
  | 'booking'
  | 'appointment'
  | 'clinic-appointment'
  | 'reminder'
  | 'default'

const NETWORK = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'
const SERVER = 'Сервис временно недоступен. Попробуйте через несколько минут.'
const VALIDATION = 'Проверьте поля формы.'
const GENERIC = 'Что-то пошло не так. Попробуйте ещё раз.'

const byContext: Partial<Record<ErrorContext, Partial<Record<number, string>>>> = {
  login: { 401: 'Неверный email или пароль.', 403: 'Аккаунт заблокирован.' },
  register: { 409: 'Этот email уже зарегистрирован.' },
  recover: { 400: 'Неверный email или код.' },
  'change-password': { 400: 'Неверный текущий пароль.' },
  'recovery-code': { 400: 'Неверный текущий пароль.' },
  'clinic-account': { 409: 'У клиники уже есть аккаунт или email занят.' },
  vet: { 404: 'Врач не найден. Список врачей обновлён.' },
  pet: { 404: 'Питомец не найден. Список питомцев обновлён.' },
  health: {
    403: 'Запись внесена клиникой — изменить её может только клиника.',
    404: 'Запись не найдена. Список обновлён.',
  },
  booking: {
    404: 'Врач или клиника больше не принимают записи. Выберите другого врача.',
    409: 'Это время только что заняли. Выберите другое.',
  },
  appointment: {
    404: 'Запись не найдена.',
    409: 'Запись уже нельзя отменить: приём начался, либо она завершена или отменена.',
  },
  'clinic-appointment': {
    404: 'Запись не найдена. Список обновлён.',
    409: 'Запись уже изменилась: её подтвердили, отменили или время приёма прошло. Список обновлён.',
  },
  reminder: {
    403: 'Дела курса не удаляются. Список обновлён.',
    404: 'Дело не найдено. Список обновлён.',
    409: 'Дело уже отмечено или его день ещё не наступил. Список обновлён.',
  },
}

/** Текст ошибки запроса для пользователя. Ошибки полей 422 — в ApiError.fieldErrors. */
export function errorMessage(error: unknown, context: ErrorContext = 'default'): string {
  if (isNetworkError(error)) return NETWORK
  if (!(error instanceof ApiError)) return GENERIC
  if (error.status >= 500) return SERVER
  if (error.status === 429) return tooManyAttempts(error.retryAfter)
  if (error.status === 422) return VALIDATION
  return byContext[context]?.[error.status] ?? GENERIC
}

function tooManyAttempts(retryAfter: number | null): string {
  if (retryAfter === null) return 'Слишком много попыток. Попробуйте позже.'
  const minutes = Math.max(1, Math.ceil(retryAfter / 60))
  return `Слишком много попыток. Попробуйте через ${minutes}\u00A0${pluralize(minutes, ['минуту', 'минуты', 'минут'])}.`
}

/** Клиентские проверки форм (#29, #30, админка клиник, питомцы). */
export const validationMessages = {
  required: 'Заполните поле',
  email: 'Введите email в формате name@example.com',
  passwordLength: 'Пароль — не короче 8 символов',
  passwordMismatch: 'Пароли не совпадают',
  recoveryCode: 'Код в формате XXXX-XXXX-XXXX-XXXX',
  phone: 'Телефон: +7 и 10 цифр',
  closesAfterOpens: 'Закрытие — позже открытия',
  workDays: 'Выберите хотя бы один рабочий день',
  species: 'Выберите вид',
  birthDateFuture: 'Дата рождения — не позже сегодняшнего дня',
  birthDateTooEarly: 'Дата рождения — не раньше 1900 года',
  dateFuture: 'Дата — не позже сегодняшнего дня',
  dateTooEarly: 'Дата — не раньше 1900 года',
  conditionKind: 'Выберите тип',
  observationEmpty: 'Заполните хотя бы одно поле, кроме даты',
  weight: 'Вес — число от 0,1 до 200 кг, не больше двух знаков после запятой',
  nextDateAfter: 'Следующая прививка — позже даты прививки',
  reason: 'Выберите причину обращения',
  pet: 'Выберите питомца',
  slotTaken: 'Это время только что заняли. Выберите другое.',
  clinicComment: 'Напишите владельцу, почему запись отменена',
  dateRange: '«По» — не раньше «С»',
  dateBeforeToday: 'Дата — не раньше сегодняшнего дня',
  yearAhead: 'Не дальше чем на год вперёд',
  timePast: 'Это время уже прошло',
  repeatDays: 'Повтор — от 1 до 365 дней',
} as const

/** Почему пользователь оказался на экране входа. */
export type SessionReason = 'expired' | 'signed-out-elsewhere' | 'logout-pending' | 'password-recovered'

const sessionReasons: Record<SessionReason, string> = {
  expired: 'Сессия истекла — войдите снова',
  'signed-out-elsewhere': 'Вы вышли в другой вкладке',
  'logout-pending': 'Вы вышли на этом устройстве. На сервере сессия завершится, когда появится связь',
  'password-recovered': 'Пароль изменён — войдите с новым паролем',
}

/** Текст причины из location.state экрана входа или null. */
export function sessionReasonMessage(reason: unknown): string | null {
  return typeof reason === 'string' && Object.hasOwn(sessionReasons, reason)
    ? sessionReasons[reason as SessionReason]
    : null
}
