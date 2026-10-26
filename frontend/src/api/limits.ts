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
