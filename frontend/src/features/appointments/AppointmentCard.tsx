import { X } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router-dom'
import type { Appointment } from '../../api/schema'
import { Badge, Button, buttonClass } from '../../components/ui'
import { appointmentReasonLabel, appointmentStatusLabel, appointmentStatusTone, cancelledByLabel } from '../../lib/labels'
import { formatSlot } from './format'

interface AppointmentCardProps {
  appointment: Appointment
  /** Нет — отменить нельзя: запись прошла, началась или закрыта (Р-48). */
  onCancel?: () => void
}

/** Запись в «Моих записях»: когда, куда, к кому, зачем и что с ней сейчас. */
export function AppointmentCard({ appointment, onCancel }: AppointmentCardProps) {
  const headingId = useId()
  const when = formatSlot(appointment.slot_start)
  // Подпись для скринридера — с датой: в списке много одинаковых «Подробнее».
  const forRecord = <span className="sr-only">, запись на {when}</span>

  return (
    <article aria-labelledby={headingId} className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={headingId} className="font-extrabold first-letter:uppercase">
          {when}
        </h3>
        <Badge tone={appointmentStatusTone[appointment.status]}>{appointmentStatusLabel[appointment.status]}</Badge>
      </div>
      <p className="mt-1 text-sm break-words">
        {appointment.clinic.name} · {appointment.vet.full_name}
      </p>
      <p className="mt-1 text-sm break-words text-ink-muted">
        {appointmentReasonLabel[appointment.reason]}
        {appointment.reason_comment && <>: {appointment.reason_comment}</>}
      </p>
      {appointment.status === 'cancelled' && appointment.cancelled_by && (
        <p className="mt-2 text-sm break-words">
          {cancelledByLabel[appointment.cancelled_by]}
          {appointment.clinic_comment && <>: «{appointment.clinic_comment}»</>}
        </p>
      )}
      {appointment.outcome && <p className="mt-2 text-sm break-words">Итог: {appointment.outcome.conclusion}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to={`/appointments/${appointment.id}`} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          Подробнее{forRecord}
        </Link>
        {onCancel && (
          <Button variant="secondary" size="sm" icon={X} onClick={onCancel}>
            Отменить{forRecord}
          </Button>
        )}
      </div>
    </article>
  )
}
