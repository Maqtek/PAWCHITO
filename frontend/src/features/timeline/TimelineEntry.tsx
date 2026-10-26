import { NotebookPen, Pill, Stethoscope, Syringe, type LucideIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Appointment, Observation, Prescription, TimelineItem, Vaccination } from '../../api/schema'
import { Badge, linkClass, toneSoftClass } from '../../components/ui'
import { cn } from '../../lib/cn'
import { formatDays, formatLongDate, formatTime } from '../../lib/format'
import { dataSourceLabel, type Tone } from '../../lib/labels'
import { courseLastDay } from '../reminders/course'
import { observationFacts } from './timeline'

interface TimelineEntryProps {
  item: TimelineItem
  /** id заголовка дня: дата входит в имя элемента для скринридера. */
  dayId: string
}

/** Элемент ленты истории — своя компактная карточка у каждого типа (Р-66). */
export function TimelineEntry({ item, dayId }: TimelineEntryProps) {
  switch (item.type) {
    case 'observation':
      return <ObservationEntry observation={item.data} dayId={dayId} />
    case 'vaccination':
      return <VaccinationEntry vaccination={item.data} dayId={dayId} />
    case 'appointment':
      return <AppointmentEntry appointment={item.data} dayId={dayId} date={item.date} />
    case 'prescription':
      return <CourseEntry prescription={item.data} dayId={dayId} />
  }
}

interface EntryProps {
  dayId: string
  icon: LucideIcon
  tone: Tone
  title: string
  fromClinic?: boolean
  children: ReactNode
}

function Entry({ dayId, icon: Icon, tone, title, fromClinic = false, children }: EntryProps) {
  const titleId = useId()
  return (
    // Имя — заголовок и день: в ленте много одинаковых «Наблюдение». tabIndex -1: сюда уходит фокус после «Показать ещё».
    <article aria-labelledby={`${titleId} ${dayId}`} tabIndex={-1} className="rounded-xl border border-line p-4 outline-none">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', toneSoftClass[tone])}>
            <Icon aria-hidden className="size-4" />
          </span>
          <h4 id={titleId} className="min-w-0 font-extrabold break-words">
            {title}
          </h4>
        </div>
        {fromClinic && <Badge tone="sky">{dataSourceLabel.clinic}</Badge>}
      </div>
      <div className="mt-2 flex flex-col gap-1.5 text-sm">{children}</div>
    </article>
  )
}

/** Короткие пары «подпись: значение». */
function Facts({ facts }: { facts: [label: string, value: string][] }) {
  if (facts.length === 0) return null
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-1">
      {facts.map(([label, value]) => (
        <div key={label} className="flex min-w-0 gap-1.5">
          <dt className="text-ink-muted">{label}:</dt>
          <dd className="font-bold break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function ObservationEntry({ observation, dayId }: { observation: Observation; dayId: string }) {
  return (
    <Entry dayId={dayId} icon={NotebookPen} tone="butter" title="Наблюдение" fromClinic={observation.source === 'clinic'}>
      <Facts facts={observationFacts(observation)} />
      {observation.symptoms && (
        <p className="break-words whitespace-pre-line">
          <span className="text-ink-muted">Симптомы: </span>
          {observation.symptoms}
        </p>
      )}
      {observation.note && <p className="break-words whitespace-pre-line text-ink-muted">{observation.note}</p>}
    </Entry>
  )
}

function VaccinationEntry({ vaccination, dayId }: { vaccination: Vaccination; dayId: string }) {
  return (
    <Entry
      dayId={dayId}
      icon={Syringe}
      tone="lilac"
      title={`Прививка: ${vaccination.name}`}
      fromClinic={vaccination.source === 'clinic'}
    >
      <p className="text-ink-muted">
        {vaccination.next_date ? `Следующая — ${formatLongDate(vaccination.next_date)}` : 'Следующая не запланирована'}
      </p>
    </Entry>
  )
}

function AppointmentEntry({ appointment, dayId, date }: { appointment: Appointment; dayId: string; date: string }) {
  return (
    <Entry dayId={dayId} icon={Stethoscope} tone="sky" title="Приём у врача">
      <Facts
        facts={[
          ['Время', formatTime(appointment.slot_start)],
          ['Клиника', appointment.clinic.name],
          ['Врач', appointment.vet.full_name],
        ]}
      />
      {appointment.outcome && (
        <p className="break-words whitespace-pre-line">
          <span className="text-ink-muted">Заключение: </span>
          {appointment.outcome.conclusion}
        </p>
      )}
      <p>
        <Link to={`/appointments/${appointment.id}`} className={linkClass}>
          Подробнее о приёме<span className="sr-only">, {formatLongDate(date)}</span>
        </Link>
      </p>
    </Entry>
  )
}

function CourseEntry({ prescription, dayId }: { prescription: Prescription; dayId: string }) {
  return (
    <Entry dayId={dayId} icon={Pill} tone="blush" title={`Курс: ${prescription.drug}`}>
      <Facts
        facts={[
          ['Дозировка', prescription.dosage],
          ['Время', prescription.times.join(', ')],
          ['Срок', `${formatDays(prescription.duration_days)}, по ${formatLongDate(courseLastDay(prescription))}`],
        ]}
      />
      <p className="text-ink-muted">
        Дозы и прогресс — в разделе{' '}
        <Link to="/course" className={linkClass}>
          «Курс лечения»
        </Link>
        .
      </p>
    </Entry>
  )
}
