import { healthLimits } from '../../api/limits'

/** Вес: точка или запятая, до двух знаков после неё (Р-45). */
const WEIGHT = /^\d{1,3}([.,]\d{1,2})?$/

/** Число из поля веса или null для пустого; undefined — ввод не похож на вес. */
export function parseWeight(text: string): number | null | undefined {
  const value = text.trim()
  if (value === '') return null
  if (!WEIGHT.test(value)) return undefined
  const kg = Number(value.replace(',', '.'))
  return kg >= healthLimits.weightMin && kg <= healthLimits.weightMax ? kg : undefined
}

/** Вес для поля: «4,2», как его вводят по-русски. */
export const weightText = (kg: number | null | undefined) =>
  kg === null || kg === undefined ? '' : String(kg).replace('.', ',')
