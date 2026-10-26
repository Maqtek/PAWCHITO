import { healthLimits } from '../api/limits'
import type { ConditionKind, Level } from '../api/schema'
import { charCount } from './auth-validation'
import { textError } from './clinic-validation'

const KINDS: readonly ConditionKind[] = ['allergy', 'chronic']
const LEVELS: readonly Level[] = ['low', 'normal', 'high']

export const conditionTitleError = (value: unknown) => textError(value, 'Название', healthLimits.conditionTitleMax)
export const vaccineNameError = (value: unknown) => textError(value, 'Название', healthLimits.vaccineNameMax)

export function conditionKindError(value: unknown): string | null {
  return KINDS.includes(value as ConditionKind) ? null : 'Тип: аллергия или хроническое заболевание'
}

/** Аппетит и энергия: null — не отмечены. */
export function levelError(value: unknown, label: string): string | null {
  return value === null || LEVELS.includes(value as Level) ? null : `${label}: low, normal или high`
}

/** Как StrictFloat на бэке: строка «4.2» — не вес. От 0,1 до 200 кг, не больше двух знаков после запятой (Р-45). */
export function weightError(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Вес: ожидается число'
  if (value < healthLimits.weightMin || value > healthLimits.weightMax) {
    return `Вес — от 0,1 до ${healthLimits.weightMax} кг`
  }
  // 4.25 * 100 в двоичной дроби — 424.99999…: сравниваем с округлённым с допуском.
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6 ? null : 'Вес — не больше двух знаков после запятой'
}

/** Управляющие символы, кроме перевода строки: многострочный текст из textarea. */
function hasControlCharsExceptNewline(value: string): boolean {
  return [...value].some((char) => {
    const code = char.codePointAt(0) ?? 0
    return (code < 0x20 && code !== 0x0a) || code === 0x7f
  })
}

/** Необязательный многострочный текст: null и пустая строка — «не указано» (Р-44, Р-45). */
export function multilineTextError(value: unknown, label: string, max: number): string | null {
  if (value === null) return null
  if (typeof value !== 'string') return `${label}: ожидается строка`
  const text = value.trim()
  if (charCount(text) > max) return `${label} — не длиннее ${max} символов`
  return hasControlCharsExceptNewline(text) ? `${label} содержит недопустимые символы` : null
}

/** Пустой после обрезки текст хранится как null. */
export function normalizeText(value: string | null | undefined): string | null {
  const text = value?.trim() ?? ''
  return text === '' ? null : text
}
