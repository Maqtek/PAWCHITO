import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api/client'
import { errorMessage, validationMessages } from '../../api/error-messages'
import { ApiError } from '../../api/errors'
import { reminderLimits } from '../../api/limits'
import { unwrap } from '../../api/queries'
import type { EventCategory, Reminder, ReminderCreate } from '../../api/schema'
import { FormActions, Modal, SelectField, TextField, type SelectOption } from '../../components/ui'
import { addDays, moscowDateTime, moscowLocal } from '../../lib/dates'
import { eventCategoryLabel, labelOptions } from '../../lib/labels'
import { useForm } from '../../lib/use-form'
import { refetchReminders, repeatLabel } from './reminder-actions'

const CUSTOM = 'custom'
const categoryOptions = labelOptions(eventCategoryLabel, ['routine', 'treatment', 'prevention'])
const repeatOptions: SelectOption[] = [
  { value: '', label: 'Не повторять' },
  ...reminderLimits.repeatPresets.map((days) => ({ value: String(days), label: repeatLabel(days) })),
  { value: CUSTOM, label: 'Свой интервал' },
]
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

interface ReminderFormModalProps {
  open: boolean
  petId: number
  petName: string
  onClose: () => void
  onSaved: (reminder: Reminder) => void
}

/** Своё дело (БП §7): название, дата и время, тип — по умолчанию «Уход», повтор. */
export function ReminderFormModal({ open, petId, petName, onClose, onSaved }: ReminderFormModalProps) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal open={open} onClose={onClose} title="Новое дело" dismissible={!busy}>
      {/* Форма монтируется при каждом открытии — поля пустые, прошлые ошибки не остаются. */}
      {open && <ReminderForm petId={petId} petName={petName} onSaved={onSaved} onCancel={onClose} onBusyChange={setBusy} />}
    </Modal>
  )
}

interface ReminderFormProps {
  petId: number
  petName: string
  onSaved: (reminder: Reminder) => void
  onCancel: () => void
  /** Запрос идёт: окно нельзя закрыть, иначе дело сохранится, а ответ или ошибку показать будет некому. */
  onBusyChange: (busy: boolean) => void
}

/** Повтор из формы: пусто — без повтора, готовый интервал или своё число дней. */
function repeatDays(values: { repeat: string; customDays: string }): number | null {
  if (values.repeat === '') return null
  return Number(values.repeat === CUSTOM ? values.customDays.trim() : values.repeat)
}

/** Дата дела — с сегодня по сегодня + 365 дней по Москве (Р-59). */
function dateError(value: string, today: string, lastDay: string): string | undefined {
  if (value === '') return validationMessages.required
  if (value < today) return validationMessages.dateBeforeToday
  return value > lastDay ? validationMessages.yearAhead : undefined
}

/** Время — не раньше текущей минуты, если дело на сегодня. */
function timeError(values: { date: string; time: string }, now: { date: string; time: string }): string | undefined {
  if (!TIME.test(values.time)) return validationMessages.required
  return values.date === now.date && values.time < now.time ? validationMessages.timePast : undefined
}

function ReminderForm({ petId, petName, onSaved, onCancel, onBusyChange }: ReminderFormProps) {
  const queryClient = useQueryClient()
  // Момент открытия формы: от него «сегодня» и «время уже прошло»; сервер проверит ещё раз (Р-59).
  const [now] = useState(() => moscowLocal(new Date()))
  const lastDay = addDays(now.date, reminderLimits.daysAhead)
  const form = useForm({
    initial: { title: '', date: now.date, time: '', category: 'routine', repeat: '', customDays: '' },
    validate: (values) => {
      const days = repeatDays(values)
      return {
        title: values.title.trim() ? undefined : validationMessages.required,
        date: dateError(values.date, now.date, lastDay),
        time: timeError(values, now),
        customDays:
          values.repeat === CUSTOM &&
          (days === null || !Number.isInteger(days) || days < reminderLimits.repeatMin || days > reminderLimits.repeatMax)
            ? validationMessages.repeatDays
            : undefined,
      }
    },
    context: 'reminder',
    // Поля сервера — не поля формы: время дела — у поля «Время», повтор — у своего интервала.
    onError: (error) => {
      if (!(error instanceof ApiError) || error.status !== 422) return undefined
      const { title, due_at: dueAt, repeat_interval_days: repeat, category, pet_id: pet } = error.fieldErrors
      return {
        fields: { title, time: dueAt, customDays: repeat, category },
        form: pet ? 'Питомец в архиве — дела ему не добавить.' : errorMessage(error, 'reminder'),
      }
    },
    onBusyChange,
    onSubmit: async (values) => {
      const payload: ReminderCreate = {
        pet_id: petId,
        title: values.title.trim(),
        due_at: moscowDateTime(values.date, values.time),
        category: values.category as EventCategory,
        repeat_interval_days: repeatDays(values),
      }
      try {
        onSaved(await unwrap(api.POST('/reminders', { body: payload })))
      } finally {
        // И после ошибки: ответ мог не дойти, а дело — сохраниться.
        refetchReminders(queryClient)
      }
    },
  })

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">
        Для питомца <span className="font-bold text-ink">{petName}</span>. Дела курса лечения появляются сами после
        приёма.
      </p>
      <TextField
        label="Название"
        hint="Например, «Почистить зубы»"
        autoComplete="off"
        maxLength={reminderLimits.titleMax}
        {...form.field('title')}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Дата" type="date" min={now.date} max={lastDay} {...form.field('date')} />
        <TextField label="Время" type="time" {...form.field('time')} />
      </div>
      <SelectField label="Тип" options={categoryOptions} {...form.field('category')} />
      <SelectField
        label="Повтор"
        hint="Следующее дело появится после отметки — от плановой даты"
        options={repeatOptions}
        {...form.field('repeat')}
      />
      {form.values.repeat === CUSTOM && (
        <TextField
          label="Раз в сколько дней"
          hint={`От ${reminderLimits.repeatMin} до ${reminderLimits.repeatMax}`}
          inputMode="numeric"
          autoComplete="off"
          {...form.field('customDays')}
        />
      )}
      <FormActions
        error={form.formError}
        submitting={form.submitting}
        submitLabel="Добавить дело"
        submittingLabel="Добавляем…"
        onCancel={onCancel}
      />
    </form>
  )
}
