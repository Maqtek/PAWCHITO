import { validationMessages } from '../../api/error-messages'
import { authLimits } from '../../api/limits'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Пусто — «Заполните поле», иначе формат name@example.com. */
export function emailError(email: string): string | undefined {
  const value = email.trim()
  if (value === '') return validationMessages.required
  return EMAIL.test(value) ? undefined : validationMessages.email
}

/** Новый пароль и повтор: регистрация, восстановление, смена пароля (#30). Длина — в символах Unicode. */
export function newPasswordErrors(password: string, repeat: string): { password?: string; repeat?: string } {
  let passwordError: string | undefined
  if (password === '') passwordError = validationMessages.required
  else if ([...password].length < authLimits.passwordMin) passwordError = validationMessages.passwordLength

  let repeatError: string | undefined
  if (repeat === '') repeatError = validationMessages.required
  else if (repeat !== password) repeatError = validationMessages.passwordMismatch

  return { password: passwordError, repeat: repeatError }
}
