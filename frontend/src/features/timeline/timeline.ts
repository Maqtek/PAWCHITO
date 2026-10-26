import type { TimelineItem } from '../../api/schema'

/** Ключ элемента: id уникален только внутри типа — у приёма и прививки он может совпасть. */
export const timelineItemKey = (item: TimelineItem) => `${item.type}-${item.data.id}`
