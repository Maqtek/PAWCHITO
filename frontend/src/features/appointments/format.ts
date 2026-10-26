import { formatDayDate, formatTime } from '../../lib/format'

/** «среда, 28 октября, 10:00» — начало записи по Москве. */
export function formatSlot(slotStart: string): string {
  return `${formatDayDate(new Date(slotStart))}, ${formatTime(slotStart)}`
}
