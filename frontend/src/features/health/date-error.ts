import { validationMessages } from '../../api/error-messages'
import { healthLimits } from '../../api/limits'

/** Дата наблюдения или прививки: обязательна, не позже сегодняшнего дня по Москве и не раньше 1900 года (Р-45, Р-46). */
export function dateError(value: string, today: string): string | undefined {
  if (value === '') return validationMessages.required
  if (value > today) return validationMessages.dateFuture
  return value < healthLimits.dateMin ? validationMessages.dateTooEarly : undefined
}
