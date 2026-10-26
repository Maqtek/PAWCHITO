import { Link } from 'react-router-dom'
import type { CalendarAppointmentEvent } from '../../api/schema'
import { Badge, buttonClass } from '../../components/ui'
import { appointmentStatusLabel, appointmentStatusTone, eventCategoryLabel, eventCategoryTone } from '../../lib/labels'
import { formatDue } from './due'
import { EventCard } from './EventCard'

interface AppointmentEventItemProps {
  event: CalendarAppointmentEvent
  /** Сегодня по Москве, «YYYY-MM-DD»: от него «сегодня» и «завтра». */
  today: string
}

/** Запись к врачу в календаре: когда, зачем, куда и к кому, статус; подробности и отмена — на странице записи. */
export function AppointmentEventItem({ event, today }: AppointmentEventItemProps) {
  const when = formatDue(event.at, today)

  return (
    <EventCard
      when={when}
      title={`Запись к врачу: ${event.title}`}
      badges={
        <>
          <Badge tone={appointmentStatusTone[event.status]}>{appointmentStatusLabel[event.status]}</Badge>
          <Badge tone={eventCategoryTone[event.category]}>{eventCategoryLabel[event.category]}</Badge>
        </>
      }
    >
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
    </EventCard>
  )
}
