import { useQueryClient } from '@tanstack/react-query'
import { Check, ClipboardCheck, X } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { errorMessage } from '../../api/error-messages'
import { unwrap } from '../../api/queries'
import type { Appointment } from '../../api/schema'
import { REQUEST_TIMEOUT_MS } from '../../api/session'
import { Badge, Button, FormAlert, linkClass } from '../../components/ui'
import { appointmentReasonLabel, appointmentStatusLabel, appointmentStatusTone, cancelledByLabel } from '../../lib/labels'
import { formatSlot } from '../appointments/format'
import { refetchClinicAppointments } from './clinic-appointment-cache'

/** Почему запись требует решения: врач в отпуске или в архиве (BR-05.7). */
export type VetAvailability = 'vacation' | 'archived'

interface ClinicAppointmentCardProps {
  appointment: Appointment
  now: Date
  /** Нет — врач принимает. */
  vetUnavailable?: VetAvailability
  onStatus: (message: string) => void
  /** Окна — у страницы: запись может уйти из вкладки, а окно с ответом или ошибкой должно остаться. */
  onCancel: () => void
  onOutcome: () => void
}

const cancelledByForClinic = { ...cancelledByLabel, owner: 'Владелец отменил запись', clinic: 'Вы отменили запись' }

/** Запись в кабинете клиники: подтверждение — сразу, отмена — с комментарием владельцу (Р-53). */
export function ClinicAppointmentCard({
  appointment,
  now,
  vetUnavailable,
  onStatus,
  onCancel,
  onOutcome,
}: ClinicAppointmentCardProps) {
  const queryClient = useQueryClient()
  const headingId = useId()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const started = new Date(appointment.slot_start).getTime() <= now.getTime()
  const active = appointment.status === 'requested' || appointment.status === 'confirmed'
  // Итог — у подтверждённой записи, время которой наступило (Р-56).
  const awaitingOutcome = appointment.status === 'confirmed' && started && !appointment.outcome
  const when = formatSlot(appointment.slot_start)
  // Подпись для скринридера — с питомцем и временем: в списке много одинаковых «Подтвердить».
  const forRecord = (
    <span className="sr-only">
      , {appointment.pet.name}, {when}
    </span>
  )

  // Подтверждение — без окна: его можно исправить отменой, а заявок у клиники много.
  async function confirm() {
    if (confirming) return
    onStatus('')
    setError(null)
    setConfirming(true)
    try {
      await unwrap(
        api.POST('/clinic/appointments/{id}/confirm', {
          params: { path: { id: appointment.id } },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }),
      )
      onStatus(`Запись подтверждена: ${appointment.pet.name}, ${when}. Владелец получит уведомление.`)
    } catch (failure) {
      setError(errorMessage(failure, 'clinic-appointment'))
    } finally {
      setConfirming(false)
      refetchClinicAppointments(queryClient)
    }
  }

  return (
    <article aria-labelledby={headingId} className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={headingId} className="font-extrabold first-letter:uppercase">
          {when}
        </h3>
        <div className="flex flex-wrap gap-2">
          {vetUnavailable && (
            <Badge tone="butter">{vetUnavailable === 'vacation' ? 'Врач в отпуске' : 'Врач в архиве'}</Badge>
          )}
          <Badge tone={appointmentStatusTone[appointment.status]}>{appointmentStatusLabel[appointment.status]}</Badge>
        </div>
      </div>
      <p className="mt-1 text-sm break-words">
        {/* Карточку открывает только неотменённая запись (Р-54). */}
        {appointment.status === 'cancelled' ? (
          <span className="font-bold">{appointment.pet.name}</span>
        ) : (
          <Link to={`/clinic/pets/${appointment.pet.id}`} className={linkClass}>
            {appointment.pet.name}
          </Link>
        )}{' '}
        · {appointment.vet.full_name}
      </p>
      <p className="mt-1 text-sm break-words whitespace-pre-line text-ink-muted">
        {appointmentReasonLabel[appointment.reason]}
        {appointment.reason_comment && <>: {appointment.reason_comment}</>}
      </p>
      {appointment.status === 'cancelled' && appointment.cancelled_by && (
        <p className="mt-2 text-sm break-words">
          {cancelledByForClinic[appointment.cancelled_by]}
          {appointment.clinic_comment && <>: «{appointment.clinic_comment}»</>}
        </p>
      )}
      {appointment.outcome && <p className="mt-2 text-sm break-words">Итог: {appointment.outcome.conclusion}</p>}
      {error && (
        <div className="mt-3">
          <FormAlert message={error} />
        </div>
      )}
      {active && (
        <div className="mt-3 flex flex-wrap gap-2">
          {awaitingOutcome && (
            <Button
              size="sm"
              icon={ClipboardCheck}
              onClick={() => {
                onStatus('')
                setError(null)
                onOutcome()
              }}
            >
              Внести итог{forRecord}
            </Button>
          )}
          {/* Прошедшую заявку не подтверждают — её отменяют (Р-53). */}
          {appointment.status === 'requested' && !started && (
            <Button size="sm" icon={Check} aria-disabled={confirming} onClick={() => void confirm()}>
              {confirming ? 'Подтверждаем…' : 'Подтвердить'}
              {forRecord}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            icon={X}
            onClick={() => {
              onStatus('')
              setError(null)
              onCancel()
            }}
          >
            Отменить{forRecord}
          </Button>
        </div>
      )}
    </article>
  )
}
