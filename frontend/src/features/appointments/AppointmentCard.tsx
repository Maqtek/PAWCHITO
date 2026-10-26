import { X } from 'lucide-react'
import { useId } from 'react'
import type { Appointment } from '../../api/schema'
import { Button } from '../../components/ui'
import { cancelledByLabel } from '../../lib/labels'
import { AppointmentDetailsLink } from './AppointmentLinks'
import { AppointmentSummary } from './AppointmentSummary'
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

  return (
    <article aria-labelledby={headingId} className="rounded-card border border-line bg-surface p-4 shadow-card">
      <AppointmentSummary appointment={appointment} headingId={headingId} />
      {appointment.status === 'cancelled' && appointment.cancelled_by && (
        <p className="mt-2 text-sm break-words">
          {cancelledByLabel[appointment.cancelled_by]}
          {appointment.clinic_comment && <>: «{appointment.clinic_comment}»</>}
        </p>
      )}
      {appointment.outcome && <p className="mt-2 text-sm break-words">Итог: {appointment.outcome.conclusion}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <AppointmentDetailsLink id={appointment.id} when={when} />
        {onCancel && (
          <Button variant="secondary" size="sm" icon={X} onClick={onCancel}>
            {/* Подпись для скринридера — с датой: в списке много одинаковых «Отменить». */}
            Отменить<span className="sr-only">, запись на {when}</span>
          </Button>
        )}
      </div>
    </article>
  )
}
