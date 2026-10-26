import { validationMessages } from '../../api/error-messages'
import { authLimits } from '../../api/limits'
import { isRecoveryCode, normalizeRecoveryCode } from '../../lib/recovery-code'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Пусто — «Заполните поле». Одни пробелы — тоже пусто: текст перед отправкой обрезается.
 * В пароле пробел — символ, поэтому для паролей trim: false.
 */
export function requiredError(value: string, { trim = true } = {}): string | undefined {
  return (trim ? value.trim() : value) === '' ? validationMessages.required : undefined
}

/** Пусто — «Заполните поле», иначе формат name@example.com. */
export function emailError(email: string): string | undefined {
  const value = email.trim()
  if (value === '') return validationMessages.required
  return EMAIL.test(value) ? undefined : validationMessages.email
}

/** Код восстановления: пусто — «Заполните поле», иначе XXXX-XXXX-XXXX-XXXX; регистр и разделители не важны. */
export function recoveryCodeError(code: string): string | undefined {
  const value = normalizeRecoveryCode(code)
  if (value === '') return validationMessages.required
  return isRecoveryCode(value) ? undefined : validationMessages.recoveryCode
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
