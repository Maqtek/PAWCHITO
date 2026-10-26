import type {
  AppointmentReason,
  AppointmentStatus,
  CancelledBy,
  CareStatus,
  ConditionKind,
  DataSource,
  EventCategory,
  Level,
  ReminderStatus,
  Role,
  Sex,
  Species,
} from '../api/schema'

/** Цветовая пара из токенов макета. */
export type Tone = 'mint' | 'butter' | 'blush' | 'sky' | 'lilac' | 'coral' | 'neutral'

/**
 * Варианты выпадающего списка из подписей — подходят как SelectOption. Порядок задаётся явно:
 * у части подписей он не совпадает с порядком ключей (пол: «Не указан» — первым).
 */
export function labelOptions<K extends string>(
  labels: Record<K, string>,
  order: readonly K[],
): { value: K; label: string }[] {
  return order.map((value) => ({ value, label: labels[value] }))
}

export const roleLabel: Record<Role, string> = {
  owner: 'Владелец',
  clinic: 'Клиника',
  admin: 'Администратор',
}

export const speciesLabel: Record<Species, string> = {
  dog: 'Собака',
  cat: 'Кошка',
  other: 'Другое',
}

export const sexLabel: Record<Sex, string> = {
  male: 'Мальчик',
  female: 'Девочка',
  unknown: 'Не указан',
}

export const conditionKindLabel: Record<ConditionKind, string> = {
  allergy: 'Аллергия',
  chronic: 'Хроническое заболевание',
}

export const conditionKindOptions = labelOptions(conditionKindLabel, ['allergy', 'chronic'])

export const conditionKindTone: Record<ConditionKind, Tone> = {
  allergy: 'coral',
  chronic: 'lilac',
}

/** Аппетит и энергия в дневнике (БП §3: снижен / норма / повышен): одна подпись подходит к обоим словам. */
export const levelLabel: Record<Level, string> = {
  low: 'Ниже обычного',
  normal: 'Как обычно',
  high: 'Выше обычного',
}

export const dataSourceLabel: Record<DataSource, string> = {
  owner: 'Внесено вами',
  clinic: 'Внесено клиникой',
}

export const careStatusOrder: CareStatus[] = ['routine', 'attention', 'treatment', 'recovery', 'prevention']

export const careStatusLabel: Record<CareStatus, string> = {
  routine: 'В норме',
  attention: 'Требует внимания',
  treatment: 'На лечении',
  recovery: 'Восстанавливается',
  prevention: 'На профилактике',
}

export const careStatusTone: Record<CareStatus, Tone> = {
  routine: 'mint',
  attention: 'butter',
  treatment: 'blush',
  recovery: 'sky',
  prevention: 'lilac',
}

export const eventCategoryLabel: Record<EventCategory, string> = {
  treatment: 'Лечение',
  routine: 'Уход',
  prevention: 'Профилактика',
}

export const eventCategoryTone: Record<EventCategory, Tone> = {
  treatment: 'blush',
  routine: 'mint',
  prevention: 'lilac',
}

export const appointmentStatusLabel: Record<AppointmentStatus, string> = {
  requested: 'Заявка',
  confirmed: 'Подтверждена',
  completed: 'Завершена',
  cancelled: 'Отменена',
}

export const appointmentStatusTone: Record<AppointmentStatus, Tone> = {
  requested: 'butter',
  confirmed: 'mint',
  completed: 'sky',
  cancelled: 'neutral',
}

/** Причина обращения (БП §5). */
export const appointmentReasonLabel: Record<AppointmentReason, string> = {
  checkup: 'Плановый осмотр',
  vaccination: 'Вакцинация',
  illness: 'Заболевание',
  follow_up: 'Повторный приём',
  other: 'Другое',
}

/** Кто отменил запись — так это видит владелец. */
export const cancelledByLabel: Record<CancelledBy, string> = {
  owner: 'Вы отменили запись',
  clinic: 'Клиника отменила запись',
  system: 'Запись отменена автоматически',
}

/** Статус дела (глоссарий): просрочено — не статус, а запланированное дело, время которого прошло. */
export const reminderStatusLabel: Record<ReminderStatus, string> = {
  pending: 'Запланировано',
  done: 'Выполнено',
  skipped: 'Пропущено',
}

export const reminderStatusTone: Record<ReminderStatus, Tone> = {
  pending: 'sky',
  done: 'mint',
  skipped: 'neutral',
}
