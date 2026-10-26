import { vetLimits } from '../api/limits'
import { optionalTextError, textError } from './text-validation'

export const vetNameError = (value: unknown) => textError(value, 'ФИО', vetLimits.fullNameMax)

/** Необязательное поле: null и пустая строка — «специализация не указана» (Р-38). */
export const specializationError = (value: unknown) =>
  optionalTextError(value, 'Специализация', vetLimits.specializationMax)

/** Как StrictBool на бэке: строки «true» и числа 0/1 — не флаг. */
export function vacationError(value: unknown): string | null {
  return typeof value === 'boolean' ? null : 'Отпуск: ожидается true или false'
}
