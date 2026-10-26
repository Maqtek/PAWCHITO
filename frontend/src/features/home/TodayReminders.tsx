import { CalendarCheck } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router-dom'
import type { Reminder } from '../../api/schema'
import { Card, EmptyState, linkClass } from '../../components/ui'
import { ReminderItem } from '../reminders/ReminderItem'
import { useReminderMarking } from '../reminders/useReminderMarking'

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
  const { listRef, marked, skip, skipModal } = useReminderMarking<HTMLDivElement>(today, onStatus)

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
                  <ReminderItem
                    reminder={reminder}
                    today={today}
                    onStatus={onStatus}
                    onDone={marked}
                    onSkip={() => skip(reminder)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
      {skipModal}
    </section>
  )
}
