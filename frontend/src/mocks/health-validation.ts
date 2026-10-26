import { healthLimits } from '../api/limits'
import type { ConditionKind, Level } from '../api/schema'
import { multilineTextError, textError } from './text-validation'

const KINDS: readonly ConditionKind[] = ['allergy', 'chronic']
const LEVELS: readonly Level[] = ['low', 'normal', 'high']

export const conditionTitleError = (value: unknown) => textError(value, 'Название', healthLimits.conditionTitleMax)
export const vaccineNameError = (value: unknown) => textError(value, 'Название', healthLimits.vaccineNameMax)

export function conditionKindError(value: unknown): string | null {
  return KINDS.includes(value as ConditionKind) ? null : 'Тип: аллергия или хроническое заболевание'
}

/** Проверки полей особенности: при создании тип и название обязательны, при правке — только присланные (Р-44). */
export function conditionChecks(raw: Record<string, unknown>, { creating }: { creating: boolean }) {
  const checked = (field: string) => creating || field in raw
  return {
    kind: checked('kind') ? conditionKindError(raw.kind) : null,
    title: checked('title') ? conditionTitleError(raw.title) : null,
    description:
      'description' in raw ? multilineTextError(raw.description, 'Комментарий', healthLimits.conditionDescriptionMax) : null,
  }
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
