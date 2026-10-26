import { CalendarPlus } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router-dom'
import type { Appointment } from '../../api/schema'
import { Badge, buttonClass, Card, linkClass } from '../../components/ui'
import { appointmentReasonLabel, appointmentStatusLabel, appointmentStatusTone } from '../../lib/labels'
import { formatSlot } from '../appointments/format'

/** Ближайшая «Заявка» или «Подтверждена», время которой не наступило (Р-64), иначе — приглашение записаться. */
export function NextAppointment({ appointment }: { appointment: Appointment | null }) {
  const headingId = useId()

  return (
    <section aria-labelledby={headingId}>
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id={headingId} className="text-lg font-extrabold">
            Ближайшая запись
          </h2>
          <Link to="/appointments" className={`${linkClass} text-sm`}>
            Все записи
          </Link>
        </div>
        {appointment ? (
          <Upcoming appointment={appointment} />
        ) : (
          <>
            <p className="mt-3 text-sm text-ink-muted">Предстоящих записей нет.</p>
            <Link to="/appointments/new" className={`${buttonClass({ size: 'sm' })} mt-3`}>
              <CalendarPlus aria-hidden className="size-4" />
              Записаться к врачу
            </Link>
          </>
        )}
      </Card>
    </section>
  )
}

function Upcoming({ appointment }: { appointment: Appointment }) {
  const when = formatSlot(appointment.slot_start)

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-extrabold first-letter:uppercase">{when}</p>
        <Badge tone={appointmentStatusTone[appointment.status]}>{appointmentStatusLabel[appointment.status]}</Badge>
      </div>
      <p className="mt-1 text-sm break-words">
        {appointment.clinic.name} · {appointment.vet.full_name}
      </p>
      <p className="mt-1 text-sm break-words text-ink-muted">
        {appointmentReasonLabel[appointment.reason]}
        {appointment.reason_comment && <>: {appointment.reason_comment}</>}
      </p>
      <Link to={`/appointments/${appointment.id}`} className={`${buttonClass({ variant: 'secondary', size: 'sm' })} mt-3`}>
        Подробнее
        <span className="sr-only">, запись на {when}</span>
      </Link>
    </div>
  )
}
