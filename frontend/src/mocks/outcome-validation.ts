import { healthLimits, outcomeLimits } from '../api/limits'
import type { CareStatus } from '../api/schema'
import { addDays } from '../lib/dates'
import { moscowIsoDate } from '../lib/format'
import { isoDateError } from './date-validation'
import { conditionKindError, conditionTitleError, vaccineNameError, weightError } from './health-validation'
import { fieldError, isObject, type FieldError } from './http-utils'
import { birthDateError, breedError, sexError } from './pet-validation'
import { multilineTextError, textError } from './text-validation'

const CARE_STATUSES: readonly CareStatus[] = ['routine', 'attention', 'treatment', 'recovery', 'prevention']
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

type Raw = Record<string, unknown>

/**
 * Ошибки тела итога (Р-56). Без дня приёма — только сами поля: такие ошибки идут до поиска записи (404).
 * С днём приёма — ещё даты относительно него: рецепт и прививки, как порядок часов клиники (Р-36).
 */
export function outcomeErrors(raw: Raw, appointmentDay: string | null, now = new Date()): FieldError[] {
  const errors: FieldError[] = []
  const add = (loc: (string | number)[], msg: string | null) => {
    if (msg) errors.push(fieldError(['body', ...loc], msg))
  }

  // Поля самого итога — только на первом проходе, иначе ошибки повторятся.
  if (appointmentDay === null) {
    const conclusion = typeof raw.conclusion === 'string' ? raw.conclusion.trim() : raw.conclusion
    // null — тоже «нет заключения»: поле обязательное, multilineTextError пропустил бы его как необязательное.
    add(['conclusion'], conclusion === '' || conclusion == null ? 'Напишите заключение' : multilineTextError(raw.conclusion, 'Заключение', outcomeLimits.textMax))
    add(['recommendations'], 'recommendations' in raw ? multilineTextError(raw.recommendations, 'Рекомендации', outcomeLimits.textMax) : null)
    add(['care_status'], CARE_STATUSES.includes(raw.care_status as CareStatus) ? null : 'Выберите статус ухода')
  }

  const list = (field: string, max: number, check: (item: Raw, index: number) => void) => {
    if (!(field in raw)) return
    const value = raw[field]
    if (!Array.isArray(value)) return add([field], `${field}: ожидается список`)
    if (value.length > max) return add([field], `Не больше ${max}`)
    value.forEach((item, index) => (isObject(item) ? check(item, index) : add([field, index], 'Ожидается объект')))
  }

  list('prescriptions', outcomeLimits.prescriptionsMax, (item, index) => {
    const at = (field: string) => ['prescriptions', index, field]
    if (appointmentDay === null) {
      add(at('drug'), textError(item.drug, 'Препарат', outcomeLimits.drugMax))
      add(at('dosage'), textError(item.dosage, 'Дозировка', outcomeLimits.dosageMax))
      const times = item.times
      add(
        at('times'),
        !Array.isArray(times) || times.length === 0 || times.length > outcomeLimits.timesMax
          ? `Время приёма — от 1 до ${outcomeLimits.timesMax} значений`
          : !times.every((time) => typeof time === 'string' && TIME.test(time))
            ? 'Время приёма — ЧЧ:ММ'
            : new Set(times).size !== times.length
              ? 'Время приёма не должно повторяться'
              : null,
      )
      const days = item.duration_days
      add(
        at('duration_days'),
        Number.isInteger(days) && (days as number) >= 1 && (days as number) <= outcomeLimits.durationMax
          ? null
          : `Длительность — от 1 до ${outcomeLimits.durationMax} дней`,
      )
      add(at('start_date'), 'start_date' in item ? isoDateError(item.start_date, 'Дата начала') : null)
    } else if (typeof item.start_date === 'string' && !isoDateError(item.start_date, 'Дата начала')) {
      const last = addDays(appointmentDay, outcomeLimits.startDaysMax)
      add(
        at('start_date'),
        item.start_date < appointmentDay || item.start_date > last ? 'Дата начала — от дня приёма до 30 дней после' : null,
      )
    }
  })

  list('vaccinations', outcomeLimits.vaccinationsMax, (item, index) => {
    const at = (field: string) => ['vaccinations', index, field]
    if (appointmentDay === null) {
      add(at('name'), vaccineNameError(item.name))
      add(at('date'), isoDateError(item.date, 'Дата прививки'))
      const next = item.next_date
      add(at('next_date'), next === undefined || next === null ? null : isoDateError(next, 'Следующая прививка'))
    } else if (typeof item.date === 'string' && !isoDateError(item.date, 'Дата прививки')) {
      const today = moscowIsoDate(now)
      add(at('date'), item.date < appointmentDay || item.date > today ? 'Дата прививки — от дня приёма до сегодня' : null)
      if (typeof item.next_date === 'string' && item.next_date <= item.date) {
        add(at('next_date'), 'Следующая прививка — позже даты прививки')
      }
    }
  })

  list('conditions', outcomeLimits.conditionsMax, (item, index) => {
    if (appointmentDay !== null) return
    const at = (field: string) => ['conditions', index, field]
    add(at('kind'), conditionKindError(item.kind))
    add(at('title'), conditionTitleError(item.title))
    add(
      at('description'),
      'description' in item ? multilineTextError(item.description, 'Комментарий', healthLimits.conditionDescriptionMax) : null,
    )
  })

  if (appointmentDay === null && 'pet_update' in raw) {
    const update = raw.pet_update
    if (!isObject(update)) {
      add(['pet_update'], 'pet_update: ожидается объект')
    } else {
      const at = (field: string) => ['pet_update', field]
      add(at('weight'), 'weight' in update ? (update.weight === null ? 'Вес: ожидается число' : weightError(update.weight)) : null)
      add(at('breed'), 'breed' in update ? breedError(update.breed) : null)
      add(at('birth_date'), 'birth_date' in update ? birthDateError(update.birth_date, now) : null)
      add(at('sex'), 'sex' in update ? sexError(update.sex) : null)
    }
  }
  return errors
}
