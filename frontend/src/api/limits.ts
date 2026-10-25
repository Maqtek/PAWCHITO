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
