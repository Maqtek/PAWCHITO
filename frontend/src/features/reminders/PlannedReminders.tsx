import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CalendarPlus, Plus } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { remindersQuery } from '../../api/queries'
import type { Pet, Reminder } from '../../api/schema'
import { Button, Card, EmptyState, Spinner } from '../../components/ui'
import { addDays } from '../../lib/dates'
import { formatShortDate, moscowIsoDate } from '../../lib/format'
import { formatDue, markedMessage } from './reminder-actions'
import { ReminderConfirmModal } from './ReminderConfirmModal'
import { ReminderFormModal } from './ReminderFormModal'
import { ReminderItem } from './ReminderItem'

/** Сколько дней вперёд показывать сразу и на сколько расширять кнопкой. */
const WEEK = 7

interface Dialog {
  kind: 'add' | 'skip' | 'delete'
  reminder?: Reminder
  /** Закрытое окно хранит свои данные до следующего открытия — текст не меняется, пока окно закрывается. */
  open: boolean
}

interface PlannedRemindersProps {
  pet: Pet
  onStatus: (message: string) => void
}

/**
 * Запланированные дела питомца: просроченные и на неделю вперёд, по времени (Р-60). Группы «Сегодня / Завтра / Позже»,
 * записи и сроки прививок — этап 11.
 */
export function PlannedReminders({ pet, onStatus }: PlannedRemindersProps) {
  const headingId = useId()
  const [today] = useState(() => moscowIsoDate(new Date()))
  const [weeks, setWeeks] = useState(1)
  const dateTo = addDays(today, WEEK * weeks)
  // Прошлые данные — пока грузится расширенный период: список не мигает спиннером.
  const list = useQuery({ ...remindersQuery({ pet_id: pet.id, status: 'pending', date_to: dateTo }), placeholderData: keepPreviousData })
  const [dialog, setDialog] = useState<Dialog>({ kind: 'add', open: false })
  const listRef = useRef<HTMLDivElement>(null)
  const focusList = useRef(false)

  // Отмеченное или удалённое дело пропало вместе со своей кнопкой — без этого фокус упадёт на body.
  useEffect(() => {
    if (!focusList.current) return
    focusList.current = false
    listRef.current?.focus()
  })

  function openDialog(kind: Dialog['kind'], reminder?: Reminder) {
    // Старое сообщение не висит над открытым окном, а тот же текст после следующего действия озвучится заново.
    onStatus('')
    setDialog({ kind, reminder, open: true })
  }

  function closeDialog({ gone = false } = {}) {
    if (gone) focusList.current = true
    setDialog((current) => ({ ...current, open: false }))
  }

  function content() {
    if (list.isPending) return <Spinner label="Загружаем дела" />
    if (!list.data) {
      return (
        <EmptyState
          title="Не удалось загрузить дела"
          description="Проверьте соединение и попробуйте ещё раз."
          action={<Button onClick={() => void list.refetch()}>Повторить</Button>}
        />
      )
    }
    return (
      <>
        {list.data.length === 0 ? (
          <EmptyState
            icon={CalendarPlus}
            title={weeks === 1 ? 'На неделю дел нет' : 'В этот период дел нет'}
            description="Добавьте своё дело — например, чистку зубов раз в неделю. Дела курса лечения появятся после приёма."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {list.data.map((reminder) => (
              <li key={reminder.id}>
                <ReminderItem
                  reminder={reminder}
                  today={today}
                  onStatus={onStatus}
                  onDone={(result) => {
                    onStatus(markedMessage(result, today))
                    focusList.current = true
                  }}
                  onSkip={() => openDialog('skip', reminder)}
                  onDelete={() => openDialog('delete', reminder)}
                />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => setWeeks(weeks + 1)}>
            Показать ещё неделю
          </Button>
          <span className="text-sm text-ink-muted">Просроченные и дела по {formatShortDate(dateTo)} включительно.</span>
        </div>
      </>
    )
  }

  return (
    <>
      <section aria-labelledby={headingId}>
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id={headingId} className="text-lg font-extrabold">
              Запланировано
            </h2>
            <Button variant="secondary" size="sm" icon={Plus} onClick={() => openDialog('add')}>
              Добавить дело
            </Button>
          </div>
          {/* tabIndex -1: сюда уходит фокус, когда дело пропало из списка вместе со своей кнопкой. */}
          <div ref={listRef} tabIndex={-1} className="mt-4 outline-none">
            {content()}
          </div>
        </Card>
      </section>
      <ReminderFormModal
        open={dialog.open && dialog.kind === 'add'}
        petId={pet.id}
        petName={pet.name}
        onClose={() => closeDialog()}
        onSaved={(reminder) => {
          onStatus(`Дело добавлено: ${reminder.title}, ${formatDue(reminder.due_at, today)}.`)
          closeDialog()
        }}
      />
      <ReminderConfirmModal
        open={dialog.open && (dialog.kind === 'skip' || dialog.kind === 'delete')}
        kind={dialog.kind === 'delete' ? 'delete' : 'skip'}
        reminder={dialog.reminder}
        today={today}
        onClose={() => closeDialog()}
        onSkipped={(result) => {
          onStatus(markedMessage(result, today))
          closeDialog({ gone: true })
        }}
        onDeleted={() => {
          onStatus('Дело удалено.')
          closeDialog({ gone: true })
        }}
      />
    </>
  )
}
