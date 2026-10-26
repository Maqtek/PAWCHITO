import { CalendarPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Appointment } from '../../api/schema'
import { buttonClass, linkClass, SectionCard } from '../../components/ui'
import { AppointmentDetailsLink } from '../appointments/AppointmentLinks'
import { AppointmentSummary } from '../appointments/AppointmentSummary'
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
        <div className="mt-3">
          <AppointmentSummary appointment={appointment} />
          <AppointmentDetailsLink id={appointment.id} when={formatSlot(appointment.slot_start)} className="mt-3" />
        </div>
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
