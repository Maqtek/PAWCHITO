import { CalendarCheck } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Reminder, ReminderMarked } from '../../api/schema'
import { Badge, Card, EmptyState, linkClass } from '../../components/ui'
import { eventCategoryLabel, eventCategoryTone } from '../../lib/labels'
import { useFocusAfterRender } from '../../lib/use-focus-after-render'
import { MarkActions } from '../reminders/MarkActions'
import { formatDue, markedMessage, scheduleLabel } from '../reminders/reminder-actions'
import { ReminderConfirmModal } from '../reminders/ReminderConfirmModal'

interface TodayRemindersProps {
  /** Запланированные на сегодня и просроченные, по времени (Р-64): отметить можно каждое (Р-61). */
  reminders: Reminder[]
  /** Сегодня по Москве, «YYYY-MM-DD». */
  today: string
  onStatus: (message: string) => void
}

/** Дела на сегодня вместе с просроченными: отметка — как в разделе «Дела», удаление — только там. */
export function TodayReminders({ reminders, today, onStatus }: TodayRemindersProps) {
  const headingId = useId()
  const [skipping, setSkipping] = useState<{ reminder?: Reminder; open: boolean }>({ open: false })
  // Отмеченное дело пропадает из списка вместе со своими кнопками — без этого фокус упадёт на body.
  const [listRef, focusListLater] = useFocusAfterRender<HTMLDivElement>()

  function marked(result: ReminderMarked) {
    onStatus(markedMessage(result, today))
    focusListLater()
  }

  return (
    <section aria-labelledby={headingId}>
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id={headingId} className="text-lg font-extrabold">
            Сегодня
          </h2>
          <Link to="/tasks" className={`${linkClass} text-sm`}>
            Все дела
          </Link>
        </div>
        {/* tabIndex -1: сюда уходит фокус, когда отмеченное дело пропало из списка. */}
        <div ref={listRef} tabIndex={-1} className="mt-4 outline-none">
          {reminders.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="На сегодня дел нет"
              description="Просроченных тоже нет. Дела на завтра и позже — в разделе «Дела»."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {reminders.map((reminder) => (
                <li key={reminder.id}>
                  <TodayReminder
                    reminder={reminder}
                    today={today}
                    onStatus={onStatus}
                    onDone={marked}
                    onSkip={() => {
                      // Старое сообщение не висит над открытым окном, а тот же текст после пропуска озвучится заново.
                      onStatus('')
                      setSkipping({ reminder, open: true })
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
      <ReminderConfirmModal
        open={skipping.open}
        kind="skip"
        reminder={skipping.reminder}
        today={today}
        onClose={() => setSkipping((current) => ({ ...current, open: false }))}
        onSkipped={(result) => {
          marked(result)
          setSkipping((current) => ({ ...current, open: false }))
        }}
      />
    </section>
  )
}

interface TodayReminderProps {
  reminder: Reminder
  today: string
  onDone: (result: ReminderMarked) => void
  onSkip: () => void
  onStatus: (message: string) => void
}

function TodayReminder({ reminder, today, onDone, onSkip, onStatus }: TodayReminderProps) {
  const titleId = useId()
  const when = formatDue(reminder.due_at, today)

  return (
    <article aria-labelledby={titleId} className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink-muted first-letter:uppercase">{when}</p>
          <h3 id={titleId} className="font-extrabold break-words">
            {reminder.title}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {reminder.is_overdue && <Badge tone="coral">Просрочено</Badge>}
          <Badge tone={eventCategoryTone[reminder.category]}>{eventCategoryLabel[reminder.category]}</Badge>
        </div>
      </div>
      <p className="mt-1 text-sm text-ink-muted">{scheduleLabel(reminder)}</p>
      <div className="mt-3">
        <MarkActions reminder={reminder} label={`${reminder.title}, ${when}`} onDone={onDone} onSkip={onSkip} onStatus={onStatus} />
      </div>
    </article>
  )
}
