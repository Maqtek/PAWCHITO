import type { TimelineItem } from '../../api/schema'

/** Дни ленты в порядке сервера: «YYYY-MM-DD» → элементы этого дня. */
export function groupByDate(items: TimelineItem[]): [string, TimelineItem[]][] {
  const days = new Map<string, TimelineItem[]>()
  for (const item of items) days.set(item.date, [...(days.get(item.date) ?? []), item])
  return [...days]
}

/** Ключ элемента: id уникален только внутри типа — у приёма и прививки он может совпасть. */
export const timelineItemKey = (item: TimelineItem) => `${item.type}-${item.data.id}`
