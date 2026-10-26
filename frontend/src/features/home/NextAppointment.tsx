import { CalendarPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Appointment } from '../../api/schema'
import { Badge, buttonClass, linkClass, SectionCard } from '../../components/ui'
import { appointmentReasonLabel, appointmentStatusLabel, appointmentStatusTone } from '../../lib/labels'
import { formatSlot } from '../appointments/format'

/** Ближайшая «Заявка» или «Подтверждена», время которой не наступило (Р-64), иначе — приглашение записаться. */
export function NextAppointment({ appointment }: { appointment: Appointment | null }) {
  return (
    <SectionCard
      title="Ближайшая запись"
      action={
        <Link to="/appointments" className={`${linkClass} text-sm`}>
          Все записи
        </Link>
      }
    >
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
    </SectionCard>
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
