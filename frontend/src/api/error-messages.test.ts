import { describe, expect, it } from 'vitest'
import { errorMessage, sessionReasonMessage, validationMessages } from './error-messages'
import { ApiError, NetworkError } from './errors'

const failed = (status: number, retryAfter: number | null = null) => new ApiError(status, 'detail', { retryAfter })

describe('errorMessage', () => {
  it.each([
    ['login', 401, 'Неверный email или пароль.'],
    ['login', 403, 'Аккаунт заблокирован.'],
    ['register', 409, 'Этот email уже зарегистрирован.'],
    ['recover', 400, 'Неверный email или код.'],
    ['change-password', 400, 'Неверный текущий пароль.'],
    ['recovery-code', 400, 'Неверный текущий пароль.'],
    ['register', 422, 'Проверьте поля формы.'],
    ['profile', 404, 'Что-то пошло не так. Попробуйте ещё раз.'],
  ] as const)('%s · %i → %s', (context, status, text) => {
    expect(errorMessage(failed(status), context)).toBe(text)
  })

  it('сеть и сбой сервера — общие тексты в любом контексте', () => {
    const network = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'
    expect(errorMessage(new NetworkError(), 'login')).toBe(network)
    expect(errorMessage(new TypeError('Failed to fetch'))).toBe(network)
    expect(errorMessage(failed(503), 'login')).toBe('Сервис временно недоступен. Попробуйте через несколько минут.')
  })

  it.each([
    [900, 'Слишком много попыток. Попробуйте через 15\u00A0минут.'],
    [60, 'Слишком много попыток. Попробуйте через 1\u00A0минуту.'],
    [61, 'Слишком много попыток. Попробуйте через 2\u00A0минуты.'],
    [10, 'Слишком много попыток. Попробуйте через 1\u00A0минуту.'],
    [null, 'Слишком много попыток. Попробуйте позже.'],
  ])('429, Retry-After %s → %s', (retryAfter, text) => {
    expect(errorMessage(failed(429, retryAfter), 'login')).toBe(text)
  })

  it('не ошибка API и не сеть — общий текст', () => {
    expect(errorMessage(new Error('boom'))).toBe('Что-то пошло не так. Попробуйте ещё раз.')
  })
})

describe('sessionReasonMessage', () => {
  it.each([
    ['expired', 'Сессия истекла — войдите снова'],
    ['signed-out-elsewhere', 'Вы вышли в другой вкладке'],
    ['logout-pending', 'Вы вышли на этом устройстве. На сервере сессия завершится, когда появится связь'],
    ['password-recovered', 'Пароль изменён — войдите с новым паролем'],
  ])('%s', (reason, text) => {
    expect(sessionReasonMessage(reason)).toBe(text)
  })

  it('причины нет или она неизвестна — null', () => {
    expect(sessionReasonMessage(undefined)).toBeNull()
    expect(sessionReasonMessage('toString')).toBeNull()
  })
})

it('тексты клиентских проверок форм', () => {
  expect(validationMessages).toEqual({
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
  })
})

describe('тексты админки клиник', () => {
  it('409 при создании аккаунта клиники', () => {
    expect(errorMessage(new ApiError(409, 'conflict'), 'clinic-account')).toBe('У клиники уже есть аккаунт или email занят.')
  })
})

describe('тексты врачей клиники', () => {
  it('404: врача нет или он другой клиники — список перечитывается', () => {
    expect(errorMessage(new ApiError(404, 'Врач не найден'), 'vet')).toBe('Врач не найден. Список врачей обновлён.')
    expect(errorMessage(new ApiError(404, 'Не найдено'))).toBe('Что-то пошло не так. Попробуйте ещё раз.')
  })
})
