import { moscowLocal } from '../lib/dates'
import { formatShortDate, formatTime } from '../lib/format'

/** «Петров Павел Петрович» → «Петров П. П.»; одно слово остаётся как есть. */
export function shortName(fullName: string): string {
  const [last, ...rest] = fullName.trim().split(/\s+/)
  return rest.length > 0 ? `${last} ${rest.map((part) => `${part[0]}.`).join(' ')}` : last
}

/** «30 октября в 10:00» — время записи по Москве. */
export const noticeWhen = (slotStart: string) => `${formatShortDate(slotStart)} в ${formatTime(slotStart)}`

/** Ссылка клинике — список записей на день приёма: отдельной страницы записи у клиники нет (Р-55). */
export function clinicDayLink(slotStart: string): string {
  const { date } = moscowLocal(new Date(slotStart))
  return `/clinic/appointments?date_from=${date}&date_to=${date}`
}

/** Тексты уведомлений (БП §9). Клички не склоняются — сервер этого не умеет (Р-55). */
export const noticeText = {
  requested: (pet: string, slotStart: string, vet: string) =>
    `Новая заявка: ${pet}, ${noticeWhen(slotStart)}, врач ${shortName(vet)}`,
  cancelledByOwner: (pet: string, slotStart: string, vet: string) =>
    `Владелец отменил запись: ${pet}, ${noticeWhen(slotStart)}, врач ${shortName(vet)}`,
  cancelledPetArchived: (pet: string, slotStart: string) =>
    `Запись отменена — питомец в архиве: ${pet}, ${noticeWhen(slotStart)}`,
  confirmed: (clinic: string, pet: string, slotStart: string, vet: string) =>
    `Клиника «${clinic}» подтвердила запись: ${pet}, ${noticeWhen(slotStart)}, врач ${shortName(vet)}`,
  cancelledByClinic: (clinic: string, pet: string, slotStart: string, comment: string) =>
    `Клиника «${clinic}» отменила запись: ${pet}, ${noticeWhen(slotStart)}. Комментарий: «${comment}»`,
  cancelledClinicUnavailable: (clinic: string, pet: string, slotStart: string) =>
    `Запись отменена — клиника «${clinic}» больше не принимает: ${pet}, ${noticeWhen(slotStart)}`,
  outcomeAdded: (pet: string, careStatus: string, reminders = 0) =>
    `Внесён итог приёма: ${pet} — ${careStatus.toLowerCase()}` + (reminders > 0 ? `. Дел курса: ${reminders}` : ''),
  petUpdated: (clinic: string, pet: string, changes: string[]) =>
    `Клиника «${clinic}» обновила данные питомца ${pet}: ${changes.join(', ')}`,
}
