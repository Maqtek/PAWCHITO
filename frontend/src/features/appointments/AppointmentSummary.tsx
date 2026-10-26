import type { Appointment } from '../../api/schema'
import { Badge } from '../../components/ui'
import { appointmentReasonLabel, appointmentStatusLabel, appointmentStatusTone } from '../../lib/labels'
import { formatSlot } from './format'

interface AppointmentSummaryProps {
  appointment: Appointment
  /**
   * С headingId время — заголовок h3, имя карточки записи. Без него — абзац: на главной у блока свой заголовок
   * «Ближайшая запись».
   */
  headingId?: string
}

/** Запись коротко: когда и статус, клиника и врач, причина. */
export function AppointmentSummary({ appointment, headingId }: AppointmentSummaryProps) {
  const When = headingId ? 'h3' : 'p'

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <When id={headingId} className="font-extrabold first-letter:uppercase">
          {formatSlot(appointment.slot_start)}
        </When>
        <Badge tone={appointmentStatusTone[appointment.status]}>{appointmentStatusLabel[appointment.status]}</Badge>
      </div>
      <p className="mt-1 text-sm break-words">
        {appointment.clinic.name} · {appointment.vet.full_name}
      </p>
      <p className="mt-1 text-sm break-words text-ink-muted">
        {appointmentReasonLabel[appointment.reason]}
        {appointment.reason_comment && <>: {appointment.reason_comment}</>}
      </p>
    </>
  )
}
