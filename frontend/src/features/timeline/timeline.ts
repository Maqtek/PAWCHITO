import type { Observation, TimelineItem } from '../../api/schema'
import { formatWeight } from '../../lib/format'
import { levelLabel } from '../../lib/labels'

/** Ключ элемента: id уникален только внутри типа — у приёма и прививки он может совпасть. */
export const timelineItemKey = (item: TimelineItem) => `${item.type}-${item.data.id}`

/** Показатели наблюдения «подпись — значение»: вес, аппетит, энергия; незаполненные пропускаются. */
export function observationFacts(observation: Observation): [label: string, value: string][] {
  const facts: [string, string | null][] = [
    ['Вес', observation.weight === null ? null : formatWeight(observation.weight)],
    ['Аппетит', observation.appetite && levelLabel[observation.appetite]],
    ['Энергия', observation.energy && levelLabel[observation.energy]],
  ]
  return facts.filter((fact): fact is [string, string] => fact[1] !== null)
}
