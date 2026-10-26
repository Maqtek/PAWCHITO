import { useId } from 'react'
import { Link } from 'react-router-dom'
import type { CalendarAppointmentEvent } from '../../api/schema'
import { Badge, buttonClass } from '../../components/ui'
import { appointmentStatusLabel, appointmentStatusTone, eventCategoryLabel, eventCategoryTone } from '../../lib/labels'
import { formatDue } from '../reminders/reminder-actions'

interface AppointmentEventItemProps {
  event: CalendarAppointmentEvent
  /** Сегодня по Москве, «YYYY-MM-DD»: от него «сегодня» и «завтра». */
  today: string
}

/** Запись к врачу в календаре: когда, зачем, куда и к кому, статус; подробности и отмена — на странице записи. */
export function AppointmentEventItem({ event, today }: AppointmentEventItemProps) {
  const titleId = useId()
  const when = formatDue(event.at, today)

  return (
    <article aria-labelledby={titleId} className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink-muted first-letter:uppercase">{when}</p>
          <h3 id={titleId} className="font-extrabold break-words">
            Запись к врачу: {event.title}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={appointmentStatusTone[event.status]}>{appointmentStatusLabel[event.status]}</Badge>
          <Badge tone={eventCategoryTone[event.category]}>{eventCategoryLabel[event.category]}</Badge>
        </div>
      </div>
      <p className="mt-1 text-sm break-words text-ink-muted">
        {event.clinic.name} · {event.vet.full_name}
      </p>
      <div className="mt-3">
        <Link to={`/appointments/${event.id}`} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          Подробнее
          {/* В календаре бывает несколько записей — у каждой ссылки своя подпись. */}
          <span className="sr-only">, запись на {when}</span>
        </Link>
      </div>
    </article>
  )
}
