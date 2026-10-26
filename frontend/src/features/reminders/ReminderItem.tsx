import { Trash2 } from 'lucide-react'
import { useId } from 'react'
import type { Reminder, ReminderMarked } from '../../api/schema'
import { Badge, Button } from '../../components/ui'
import { eventCategoryLabel, eventCategoryTone } from '../../lib/labels'
import { MarkActions } from './MarkActions'
import { canMark, formatDue, scheduleLabel } from './reminder-actions'

interface ReminderItemProps {
  reminder: Reminder
  /** Сегодня по Москве, «YYYY-MM-DD»: от него «сегодня» / «завтра» и можно ли отметить. */
  today: string
  onDone: (result: ReminderMarked) => void
  onSkip: () => void
  onDelete: () => void
  onStatus: (message: string) => void
}

/** Запланированное дело: когда, что, тип; отметка — на сегодня и просроченное, удаление — только своего (Р-61, Р-62). */
export function ReminderItem({ reminder, today, onDone, onSkip, onDelete, onStatus }: ReminderItemProps) {
  const titleId = useId()
  const when = formatDue(reminder.due_at, today)
  const label = `${reminder.title}, ${when}`

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
      {(canMark(reminder, today) || reminder.source === 'custom') && (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          {canMark(reminder, today) && (
            <MarkActions reminder={reminder} label={label} onDone={onDone} onSkip={onSkip} onStatus={onStatus} />
          )}
          {/* Дела курса владелец не удаляет (БП §7). */}
          {reminder.source === 'custom' && (
            <Button variant="secondary" size="sm" icon={Trash2} onClick={onDelete}>
              Удалить
              <span className="sr-only">, {label}</span>
            </Button>
          )}
        </div>
      )}
    </article>
  )
}
