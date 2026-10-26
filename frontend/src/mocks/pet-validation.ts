import { petLimits } from '../api/limits'
import type { Sex, Species } from '../api/schema'
import { pastDateError } from './date-validation'
import { optionalTextError, textError } from './text-validation'

const SPECIES: readonly Species[] = ['dog', 'cat', 'other']
const SEXES: readonly Sex[] = ['male', 'female', 'unknown']

export const petNameError = (value: unknown) => textError(value, 'Кличка', petLimits.nameMax)

export function speciesError(value: unknown): string | null {
  return SPECIES.includes(value as Species) ? null : 'Вид: собака, кошка или другое'
}

export function sexError(value: unknown): string | null {
  return SEXES.includes(value as Sex) ? null : 'Пол: male, female или unknown'
}

/** Необязательное поле: null и пустая строка — «порода не указана» (Р-41). */
export const breedError = (value: unknown) => optionalTextError(value, 'Порода', petLimits.breedMax)

/** Ровно YYYY-MM-DD и существующая дата, с 1900-01-01 по сегодня в Москве (Р-41); null — дата не указана. */
export function birthDateError(value: unknown, today = new Date()): string | null {
  return value === null ? null : pastDateError(value, 'Дата рождения', today)
}
