/**
 * Лимиты полей авторизации: формы #29/#30 и моки; согласуются с бэком (#22).
 * Длина — в символах Unicode (code points), как len() в Python; в JS — [...str].length, а не str.length.
 */
export const authLimits = {
  emailMax: 254,
  fullNameMax: 100,
  passwordMin: 8,
  passwordMax: 128,
} as const

/**
 * Лимиты полей клиники (контракты, раздел 9 «Лимиты полей клиники»).
 * Длина — в символах Unicode (code points), как у authLimits. Часы — в пределах суток, 00:00–23:30 (Р-33).
 */
export const clinicLimits = {
  nameMax: 100,
  addressMax: 200,
} as const

/**
 * Лимиты полей врача (контракты, раздел 5 «Лимиты полей врача»).
 * Длина — в символах Unicode (code points), как у authLimits. Специализация необязательна (Р-38).
 */
export const vetLimits = {
  fullNameMax: 100,
  specializationMax: 100,
} as const

/**
 * Лимиты полей питомца (контракты, раздел 2 «Лимиты полей питомца»).
 * Длина — в символах Unicode (code points), как у authLimits. Порода и дата рождения необязательны (Р-41).
 */
export const petLimits = {
  nameMax: 50,
  breedMax: 100,
  /** Раньше — опечатка вроде 0202; позже сегодняшнего дня по Москве дата тоже не проходит. */
  birthDateMin: '1900-01-01',
} as const

/**
 * Лимиты полей здоровья (контракты, раздел 3 «Лимиты полей здоровья»).
 * Длина — в символах Unicode (code points), как у authLimits. Даты — с 1900-01-01 по сегодня по Москве (Р-45, Р-46).
 */
export const healthLimits = {
  conditionTitleMax: 100,
  conditionDescriptionMax: 1000,
  weightMin: 0.1,
  weightMax: 200,
  symptomsMax: 500,
  noteMax: 1000,
  vaccineNameMax: 100,
  dateMin: '1900-01-01',
} as const

/** Итог приёма (контракты, раздел 5 «Лимиты полей итога»; БП §6, Р-56). */
export const outcomeLimits = {
  textMax: 2000,
  prescriptionsMax: 10,
  vaccinationsMax: 5,
  conditionsMax: 5,
  drugMax: 100,
  dosageMax: 100,
  timesMax: 6,
  durationMax: 90,
  /** Дата начала рецепта — не позже дня приёма + 30 дней. */
  startDaysMax: 30,
  /** Фото питомца — до 5 МБ (БП §6.4). */
  photoBytesMax: 5 * 1024 * 1024,
} as const

/** Запись к врачу (контракты, раздел 4 «Лимиты полей записи»; БП §5). */
export const appointmentLimits = {
  reasonCommentMax: 500,
  /** Окно записи: с сегодня по сегодня + 30 дней по Москве включительно (Р-49). */
  daysAhead: 30,
  slotMinutes: 30,
} as const
