import { useId } from 'react'
import { Link } from 'react-router-dom'
import type { CalendarVaccinationEvent } from '../../api/schema'
import { Badge, buttonClass } from '../../components/ui'
import { eventCategoryLabel, eventCategoryTone } from '../../lib/labels'
import { formatDueDay } from './calendar-event'

interface VaccinationDueItemProps {
  event: CalendarVaccinationEvent
  /** Сегодня по Москве, «YYYY-MM-DD». */
  today: string
}

/** Срок следующей прививки (БП §3): только дата, без времени; сама прививка и её даты — в «Истории». */
export function VaccinationDueItem({ event, today }: VaccinationDueItemProps) {
  const titleId = useId()

  return (
    <article aria-labelledby={titleId} className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink-muted first-letter:uppercase">{formatDueDay(event.at, today)}</p>
          <h3 id={titleId} className="font-extrabold break-words">
            Прививка: {event.title}
          </h3>
        </div>
        <Badge tone={eventCategoryTone[event.category]}>{eventCategoryLabel[event.category]}</Badge>
      </div>
      <p className="mt-1 text-sm text-ink-muted">Срок следующей прививки</p>
      <div className="mt-3">
        <Link to="/history" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          Открыть в «Истории»
          <span className="sr-only">, прививка {event.title}</span>
        </Link>
      </div>
    </article>
  )
}
