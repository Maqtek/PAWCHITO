import { useQuery } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'
import { remindersQuery } from '../../api/queries'
import type { Reminder } from '../../api/schema'
import { Button, Card } from '../../components/ui'
import { addDays } from '../../lib/dates'
import { formatShortDate } from '../../lib/format'
import { CALENDAR_DAYS } from '../calendar/calendar-event'

/** Сколько дальних дел видно сразу: у долгого курса лечения их бывают сотни. */
const PREVIEW = 10

interface FarRemindersProps {
  petId: number
  /** Сегодня по Москве, «YYYY-MM-DD». */
  today: string
  renderReminder: (reminder: Reminder) => ReactNode
}

/**
 * Запланированные дела дальше 30 дней: в календарь они не входят, и без этого списка своё дело на год вперёд (Р-59)
 * не увидеть и не удалить (Р-65). Таких дел нет — раздела тоже нет.
 */
export function FarReminders({ petId, today, renderReminder }: FarRemindersProps) {
  const headingId = useId()
  const from = addDays(today, CALENDAR_DAYS + 1)
  const list = useQuery(remindersQuery({ pet_id: petId, status: 'pending', date_from: from }))
  const [expanded, setExpanded] = useState(false)

  const all = list.data
  if (list.isPending || all?.length === 0) return null

  return (
    <section aria-labelledby={headingId}>
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id={headingId} className="text-lg font-extrabold">
            Дальше 30 дней
          </h2>
          <p className="text-sm text-ink-muted">с {formatShortDate(from)}</p>
        </div>
        {!all ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-ink-muted">Не удалось загрузить дела дальше 30 дней.</p>
            <Button variant="secondary" size="sm" onClick={() => void list.refetch()}>
              Повторить
            </Button>
          </div>
        ) : (
          <>
            <ul className="mt-4 flex flex-col gap-3">
              {(expanded ? all : all.slice(0, PREVIEW)).map((reminder) => (
                <li key={reminder.id}>{renderReminder(reminder)}</li>
              ))}
            </ul>
            {all.length > PREVIEW && (
              // Кнопка не пропадает после нажатия, а меняет подпись: фокус остаётся на ней.
              <Button
                className="mt-4"
                variant="secondary"
                size="sm"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? 'Свернуть' : `Показать все (${all.length})`}
              </Button>
            )}
          </>
        )}
      </Card>
    </section>
  )
}
