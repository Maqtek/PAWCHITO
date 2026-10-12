import type { AppointmentStatus, CareStatus, EventCategory, Role, Species } from '../api/schema'

/** Цветовая пара из токенов макета. */
export type Tone = 'mint' | 'butter' | 'blush' | 'sky' | 'lilac' | 'coral' | 'neutral'

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
