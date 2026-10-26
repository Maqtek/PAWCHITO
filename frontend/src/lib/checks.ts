import { validationMessages } from '../api/error-messages'

/**
 * Пусто — «Заполните поле». Одни пробелы — тоже пусто: текст перед отправкой обрезается.
 * В пароле пробел — символ, поэтому для паролей trim: false.
 */
export function requiredError(value: string, { trim = true } = {}): string | undefined {
  return (trim ? value.trim() : value) === '' ? validationMessages.required : undefined
}
