/**
 * Даты записи к врачу в часовом поясе системы — Europe/Moscow (БП §5).
 * В Москве с 2014 года нет перехода на летнее время: смещение всегда +03:00, поэтому время считается сдвигом от UTC.
 */
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000

/** «YYYY-MM-DD» плюс days дней — без часовых поясов, только календарь. */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** День недели даты «YYYY-MM-DD»: 1 — понедельник … 7 — воскресенье, как work_days клиники. */
export function isoWeekday(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7
}

/** Дата-время со смещением Москвы: «2026-10-15T10:00:00+03:00». */
export function moscowDateTime(isoDate: string, time: string): string {
  return `${isoDate}T${time}:00+03:00`
}

/** Дата «YYYY-MM-DD» и время «HH:MM» момента по Москве; seconds — остаток после минут, для проверки сетки. */
export function moscowLocal(instant: Date): { date: string; time: string; seconds: number } {
  const shifted = new Date(instant.getTime() + MOSCOW_OFFSET_MS)
  const iso = shifted.toISOString()
  return { date: iso.slice(0, 10), time: iso.slice(11, 16), seconds: shifted.getUTCSeconds() + shifted.getUTCMilliseconds() / 1000 }
}

/** Тот же момент в виде «2026-10-15T10:00:00+03:00» — так время отдаёт сервер. */
export function toMoscowString(instant: Date): string {
  const { date, time } = moscowLocal(instant)
  return moscowDateTime(date, time)
}
