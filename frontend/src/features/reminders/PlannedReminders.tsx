import { useQuery } from '@tanstack/react-query'
import { CalendarPlus, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { calendarQuery } from '../../api/queries'
import type { CalendarEvent, Pet, Reminder } from '../../api/schema'
import { Button, EmptyState, LoadError, Spinner } from '../../components/ui'
import { moscowIsoDate } from '../../lib/format'
import { AppointmentEventItem } from '../calendar/AppointmentEventItem'
import { calendarGroups, eventReminder, formatDueWithYear, groupPeriod } from '../calendar/calendar-event'
import { CalendarGroup } from '../calendar/CalendarGroup'
import { VaccinationDueItem } from '../calendar/VaccinationDueItem'
import { FarReminders } from './FarReminders'
import { markedMessage } from './reminder-actions'
import { ReminderConfirmModal } from './ReminderConfirmModal'
import { ReminderFormModal } from './ReminderFormModal'
import { ReminderItem } from './ReminderItem'

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
 * Календарь питомца в разделе «Дела» (Р-65): группы «Сегодня» (с просроченными делами), «Завтра» и «Позже» — дела,
 * записи к врачу и сроки прививок на 30 дней; дела дальше — отдельным списком.
 */
export function PlannedReminders({ pet, onStatus }: PlannedRemindersProps) {
  const [today] = useState(() => moscowIsoDate(new Date()))
  const calendar = useQuery(calendarQuery(pet.id))
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

  function reminderItem(reminder: Reminder) {
    return (
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
    )
  }

  function eventItem(event: CalendarEvent) {
    switch (event.type) {
      case 'reminder':
        return reminderItem(eventReminder(event, pet.id))
      case 'appointment':
        return <AppointmentEventItem event={event} today={today} />
      case 'vaccination_due':
        return <VaccinationDueItem event={event} today={today} />
    }
  }

  function groups() {
    if (calendar.isPending) return <Spinner label="Загружаем дела" />
    if (!calendar.data) return <LoadError title="Не удалось загрузить дела" onRetry={() => void calendar.refetch()} />
    const { data } = calendar
    if (calendarGroups.every(({ key }) => data[key].length === 0)) {
      return (
        <EmptyState
          icon={CalendarPlus}
          title="На 30 дней вперёд ничего не запланировано"
          description="Добавьте своё дело — например, чистку зубов раз в неделю. Здесь же появятся дела курса лечения, записи к врачу и сроки прививок."
        />
      )
    }
    return calendarGroups.map(({ key, title }) => (
      <CalendarGroup key={key} title={title} period={groupPeriod(key, today)} events={data[key]} renderEvent={eventItem} />
    ))
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button icon={Plus} onClick={() => openDialog('add')}>
          Добавить дело
        </Button>
      </div>
      {/* tabIndex -1: сюда уходит фокус, когда дело пропало из списка вместе со своей кнопкой. */}
      <div ref={listRef} tabIndex={-1} className="flex flex-col gap-4 outline-none">
        {groups()}
        <FarReminders petId={pet.id} today={today} renderReminder={reminderItem} />
      </div>
      <ReminderFormModal
        open={dialog.open && dialog.kind === 'add'}
        petId={pet.id}
        petName={pet.name}
        onClose={() => closeDialog()}
        onSaved={(reminder) => {
          onStatus(`Дело добавлено: ${reminder.title}, ${formatDueWithYear(reminder.due_at, today)}.`)
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
