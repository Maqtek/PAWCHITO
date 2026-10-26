import { Link } from 'react-router-dom'
import type { CalendarVaccinationEvent } from '../../api/schema'
import { Badge, buttonClass } from '../../components/ui'
import { eventCategoryLabel, eventCategoryTone } from '../../lib/labels'
import { formatDueDay } from './due'
import { EventCard } from './EventCard'

interface VaccinationDueItemProps {
  event: CalendarVaccinationEvent
  /** Сегодня по Москве, «YYYY-MM-DD». */
  today: string
}

/** Срок следующей прививки (БП §3): только дата, без времени; сама прививка и её даты — в «Истории». */
export function VaccinationDueItem({ event, today }: VaccinationDueItemProps) {
  return (
    <EventCard
      when={formatDueDay(event.at, today)}
      title={`Прививка: ${event.title}`}
      badges={<Badge tone={eventCategoryTone[event.category]}>{eventCategoryLabel[event.category]}</Badge>}
    >
      <p className="mt-1 text-sm text-ink-muted">Срок следующей прививки</p>
      <div className="mt-3">
        <Link to="/history" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          Открыть в «Истории»
          <span className="sr-only">, прививка {event.title}</span>
        </Link>
      </div>
    </EventCard>
  )
}
