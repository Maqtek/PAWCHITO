import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { appointmentQuery } from '../../api/queries'
import { ApiError } from '../../api/errors'
import type { AppointmentOutcome } from '../../api/schema'
import { Badge, Button, Card, EmptyState, LoadError, Spinner, linkClass } from '../../components/ui'
import { isCancellable } from '../../features/appointments/appointment-cache'
import { CancelAppointmentModal } from '../../features/appointments/CancelAppointmentModal'
import { formatSlot } from '../../features/appointments/format'
import { PageHeader } from '../../layouts/PageHeader'
import { formatLongDate, formatTime, NBSP, pluralize } from '../../lib/format'
import {
  appointmentReasonLabel,
  appointmentStatusLabel,
  appointmentStatusTone,
  cancelledByLabel,
  careStatusLabel,
} from '../../lib/labels'

/** Запись владельца: сюда ведут мастер записи и уведомления (`link: /appointments/20`). */
export function AppointmentPage() {
  const id = Number(useParams().appointmentId)
  const { data: appointment, isPending, error, refetch } = useQuery({ ...appointmentQuery(id), enabled: Number.isInteger(id) })
  const location = useLocation()
  const [status, setStatus] = useState(() => (location.state as { status?: string } | null)?.status ?? '')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [now] = useState(() => new Date())
  const cardRef = useRef<HTMLDivElement>(null)
  const focusCard = useRef(false)

  // После отмены кнопки «Отменить запись» больше нет — фокус переходит на карточку, а не на body.
  useEffect(() => {
    if (!focusCard.current) return
    focusCard.current = false
    cardRef.current?.focus()
  })

  const back = (
    <Link to="/appointments" className={linkClass}>
      <ArrowLeft aria-hidden className="mr-1 inline size-4" />
      Все записи
    </Link>
  )

  function content() {
    if (!Number.isInteger(id) || (error instanceof ApiError && error.status === 404)) {
      return <EmptyState title="Запись не найдена" description="Возможно, ссылка устарела." action={back} />
    }
    if (isPending) return <Spinner label="Загружаем запись" />
    if (!appointment) return <LoadError title="Не удалось загрузить запись" onRetry={() => void refetch()} />
    const rows: [string, string][] = [
      ['Питомец', appointment.pet.name],
      ['Клиника', appointment.clinic.name],
      ['Врач', appointment.vet.full_name],
      ['Время', `${formatSlot(appointment.slot_start)}–${formatTime(appointment.slot_end)}`],
      [
        'Причина',
        appointmentReasonLabel[appointment.reason] + (appointment.reason_comment ? `: ${appointment.reason_comment}` : ''),
      ],
    ]
    return (
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={appointmentStatusTone[appointment.status]}>{appointmentStatusLabel[appointment.status]}</Badge>
          {appointment.status === 'requested' && (
            <span className="text-sm text-ink-muted">Клиника ещё не подтвердила запись.</span>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-sm text-ink-muted">{label}</dt>
              <dd className="font-bold break-words first-letter:uppercase">{value}</dd>
            </div>
          ))}
        </dl>
        {appointment.status === 'cancelled' && appointment.cancelled_by && (
          <p className="mt-4 text-sm break-words">
            {cancelledByLabel[appointment.cancelled_by]}
            {appointment.clinic_comment && <>: «{appointment.clinic_comment}»</>}
          </p>
        )}
        {appointment.outcome && <OutcomeDetails outcome={appointment.outcome} />}
        {isCancellable(appointment, now) && (
          <div className="mt-5">
            <Button
              variant="secondary"
              icon={X}
              onClick={() => {
                setStatus('')
                setCancelOpen(true)
              }}
            >
              Отменить запись
            </Button>
          </div>
        )}
      </Card>
    )
  }

  return (
    <>
      <PageHeader eyebrow="Ветеринар" title="Запись к врачу" description="Когда, куда и к кому, и что с записью сейчас." />
      <div className="mb-4">{back}</div>
      {/* Регион статуса смонтирован в любом состоянии: сообщение в уже существующем регионе скринридер озвучит. */}
      <p role="status" className="mb-4 text-sm font-semibold text-primary empty:mb-0">
        {status}
      </p>
      {/* tabIndex -1: сюда уходит фокус, когда кнопка отмены пропала вместе с возможностью отменить. */}
      <div ref={cardRef} tabIndex={-1} className="max-w-2xl outline-none">
        {content()}
      </div>
      <CancelAppointmentModal
        open={cancelOpen}
        appointment={appointment}
        onClose={() => setCancelOpen(false)}
        onDone={() => {
          setStatus('Запись отменена. Клиника получит уведомление.')
          focusCard.current = true
          setCancelOpen(false)
        }}
      />
    </>
  )
}

/** Итог приёма у владельца (BR-04.8): заключение, рекомендации, статус ухода, рецепты и прививки. */
function OutcomeDetails({ outcome }: { outcome: AppointmentOutcome }) {
  return (
    <section aria-labelledby="outcome-heading" className="mt-5 border-t border-line pt-4">
      <h2 id="outcome-heading" className="font-extrabold">
        Итог приёма
      </h2>
      <p className="mt-2 text-sm break-words whitespace-pre-line">{outcome.conclusion}</p>
      {outcome.recommendations && (
        <p className="mt-1 text-sm break-words whitespace-pre-line text-ink-muted">{outcome.recommendations}</p>
      )}
      <p className="mt-2 text-sm">Статус ухода: {careStatusLabel[outcome.care_status]}</p>
      {outcome.prescriptions.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-extrabold">Рецепты</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {outcome.prescriptions.map((prescription) => (
              <li key={prescription.id} className="rounded-xl border border-line p-3 text-sm">
                <p className="font-bold break-words">
                  {prescription.drug}, {prescription.dosage}
                </p>
                <p className="text-ink-muted">
                  {prescription.times.join(', ')} · {prescription.duration_days}
                  {NBSP}
                  {pluralize(prescription.duration_days, ['день', 'дня', 'дней'])} с {formatLongDate(prescription.start_date)}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">
            Дозы курса — в разделах{' '}
            <Link to="/tasks" className={linkClass}>
              «Дела»
            </Link>{' '}
            и{' '}
            <Link to="/course" className={linkClass}>
              «Курс лечения»
            </Link>
            .
          </p>
        </>
      )}
      {outcome.vaccinations.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-extrabold">Прививки</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {outcome.vaccinations.map((vaccination) => (
              <li key={vaccination.id} className="text-sm">
                <span className="font-bold">{vaccination.name}</span> — {formatLongDate(vaccination.date)}
                {vaccination.next_date && `, следующая ${formatLongDate(vaccination.next_date)}`}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
