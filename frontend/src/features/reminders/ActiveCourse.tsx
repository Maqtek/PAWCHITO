import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { remindersQuery } from '../../api/queries'
import type { Reminder } from '../../api/schema'
import { Badge, Button, Card, EmptyState, ProgressBar, Spinner, linkClass } from '../../components/ui'
import { formatDayDate, formatShortDate, formatTime, NBSP, pluralize } from '../../lib/format'
import { reminderStatusLabel, reminderStatusTone } from '../../lib/labels'
import { progressText, type Course } from './course'
import { MarkActions } from './MarkActions'
import { canMark, dueDay, formatDue, markedMessage } from './reminder-actions'
import { ReminderConfirmModal } from './ReminderConfirmModal'

interface ActiveCourseProps {
  course: Course
  today: string
  onStatus: (message: string) => void
}

/** Дни курса с дозами по порядку: «YYYY-MM-DD» → дела этого дня. */
function groupByDay(reminders: Reminder[]): [string, Reminder[]][] {
  const days = new Map<string, Reminder[]>()
  for (const reminder of reminders) {
    const day = dueDay(reminder)
    days.set(day, [...(days.get(day) ?? []), reminder])
  }
  return [...days]
}

/**
 * Активный курс (Р-63): прогресс и дни с дозами. Прошедшие дни, где всё отмечено, скрыты под кнопкой — курс бывает
 * до 90 дней по 6 доз.
 */
export function ActiveCourse({ course, today, onStatus }: ActiveCourseProps) {
  const { prescription, appointment, lastDay } = course
  const headingId = useId()
  const reminders = useQuery(remindersQuery({ prescription_id: prescription.id }))
  const [showPast, setShowPast] = useState(false)
  const [skipping, setSkipping] = useState<{ reminder?: Reminder; open: boolean }>({ open: false })
  const daysRef = useRef<HTMLDivElement>(null)
  const focusDays = useRef(false)

  // После отметки кнопки дозы пропадают — фокус переходит на дни курса, а не на body.
  useEffect(() => {
    if (!focusDays.current) return
    focusDays.current = false
    daysRef.current?.focus()
  })

  const title = `${prescription.drug}, ${prescription.dosage}`

  function days() {
    if (reminders.isPending) return <Spinner label="Загружаем дни курса" />
    if (!reminders.data) {
      return (
        <EmptyState
          title="Не удалось загрузить дни курса"
          description="Проверьте соединение и попробуйте ещё раз."
          action={<Button onClick={() => void reminders.refetch()}>Повторить</Button>}
        />
      )
    }
    const all = reminders.data
    const count = (status: Reminder['status']) => all.filter((item) => item.status === status).length
    const progress = { total: all.length, done: count('done'), skipped: count('skipped') }
    // Показываем с сегодняшнего дня или с первой неотмеченной дозы, если она раньше.
    const firstPending = all.find((item) => item.status === 'pending')
    const from = firstPending && dueDay(firstPending) < today ? dueDay(firstPending) : today
    const grouped = groupByDay(all)
    const past = grouped.filter(([day]) => day < from)
    const visible = showPast ? grouped : grouped.filter(([day]) => day >= from)
    return (
      <>
        <p className="text-sm font-bold">{progressText(progress)}</p>
        <ProgressBar className="mt-2" value={progress.done} max={progress.total} label={`Прогресс курса: ${progressText(progress)}`} />
        {past.length > 0 && !showPast && (
          <Button className="mt-4" variant="secondary" size="sm" onClick={() => setShowPast(true)}>
            Показать прошедшие дни ({past.length})
          </Button>
        )}
        <ol className="mt-4 flex flex-col gap-2">
          {visible.map(([day, doses]) => (
            <li key={day} className="rounded-xl border border-line p-3">
              <p className="text-sm font-bold first-letter:uppercase">
                {formatDayDate(new Date(`${day}T12:00:00+03:00`))}
                {day === today && ' · сегодня'}
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {doses.map((dose) => (
                  <li key={dose.id} className="flex flex-wrap items-center gap-2">
                    <span className="w-12 font-bold tabular-nums">{formatTime(dose.due_at)}</span>
                    {dose.is_overdue && <Badge tone="coral">Просрочено</Badge>}
                    {canMark(dose, today) ? (
                      <MarkActions
                        reminder={dose}
                        label={`${title}, ${formatDue(dose.due_at, today)}`}
                        onStatus={onStatus}
                        onDone={(result) => {
                          onStatus(markedMessage(result, today))
                          focusDays.current = true
                        }}
                        onSkip={() => {
                          onStatus('')
                          setSkipping({ reminder: dose, open: true })
                        }}
                      />
                    ) : (
                      <Badge tone={reminderStatusTone[dose.status]}>{reminderStatusLabel[dose.status]}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </>
    )
  }

  return (
    <section aria-labelledby={headingId}>
      <Card className="p-5 sm:p-6">
        <h2 id={headingId} className="text-lg font-extrabold break-words">
          {title}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {prescription.times.join(', ')} · {prescription.duration_days}
          {NBSP}
          {pluralize(prescription.duration_days, ['день', 'дня', 'дней'])} · с {formatShortDate(prescription.start_date)} по{' '}
          {formatShortDate(lastDay)}
        </p>
        <p className="text-sm text-ink-muted">
          Назначил {appointment.vet.full_name}, {appointment.clinic.name} ·{' '}
          <Link to={`/appointments/${appointment.id}`} className={linkClass}>
            Итог приёма
          </Link>
        </p>
        {/* tabIndex -1: сюда уходит фокус, когда кнопки отмеченной дозы пропали. */}
        <div ref={daysRef} tabIndex={-1} className="mt-4 outline-none">
          {days()}
        </div>
      </Card>
      <ReminderConfirmModal
        open={skipping.open}
        kind="skip"
        reminder={skipping.reminder}
        today={today}
        onClose={() => setSkipping((current) => ({ ...current, open: false }))}
        onSkipped={(result) => {
          onStatus(markedMessage(result, today))
          focusDays.current = true
          setSkipping((current) => ({ ...current, open: false }))
        }}
      />
    </section>
  )
}
