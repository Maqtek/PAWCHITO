import type { CareStatus } from '../../api/schema'
import { careStatusLabel, careStatusOrder, careStatusTone } from '../../lib/labels'
import { Badge } from '../ui'

/** Все пять статусов ухода, текущий выделен (БП §6.3). */
export function CareStatusScale({ status }: { status: CareStatus | null }) {
  if (!status) {
    return <p className="text-sm text-ink-muted">Статус появится после приёма в клинике</p>
  }
  return (
    <ul aria-label="Статус ухода" className="flex flex-wrap gap-2">
      {careStatusOrder.map((value) => {
        const active = value === status
        return (
          <li key={value} aria-current={active ? 'true' : undefined}>
            <Badge tone={careStatusTone[value]} dot={active} active={active}>
              {careStatusLabel[value]}
            </Badge>
          </li>
        )
      })}
    </ul>
  )
}
