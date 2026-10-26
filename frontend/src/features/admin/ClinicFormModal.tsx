import { useQueryClient } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'
import { api } from '../../api/client'
import { validationMessages } from '../../api/error-messages'
import { clinicLimits } from '../../api/limits'
import { unwrap } from '../../api/queries'
import type { AdminClinic, ClinicCreate, ClinicUpdate } from '../../api/schema'
import { Button, CheckboxField, FormAlert, Modal, SelectField, TextField } from '../../components/ui'
import { useForm } from '../../lib/use-form'
import { refetchAfterFailure, storeClinic } from './clinic-cache'
import {
  halfHourOptions,
  normalizePhone,
  parseWorkDays,
  PHONE,
  serializeWorkDays,
  weekdayShort,
} from './clinic-format'

interface ClinicFormModalProps {
  open: boolean
  onClose: () => void
  /** Нет клиники — добавление, есть — изменение. */
  clinic?: AdminClinic
  onSaved: (clinic: AdminClinic) => void
}

export function ClinicFormModal({ open, onClose, clinic, onSaved }: ClinicFormModalProps) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal open={open} onClose={onClose} title={clinic ? 'Изменить клинику' : 'Новая клиника'} dismissible={!busy}>
      {/* Форма монтируется при каждом открытии — поля из текущих данных, прошлые ошибки не остаются. */}
      {open && <ClinicForm clinic={clinic} onSaved={onSaved} onCancel={onClose} onBusyChange={setBusy} />}
    </Modal>
  )
}

const timeOptions = halfHourOptions.map((time) => ({ value: time, label: time }))

function initialValues(clinic?: AdminClinic) {
  return clinic
    ? {
        name: clinic.name,
        address: clinic.address,
        phone: clinic.phone,
        opens_at: clinic.opens_at,
        closes_at: clinic.closes_at,
        work_days: serializeWorkDays(clinic.work_days),
      }
    : { name: '', address: '', phone: '', opens_at: '09:00', closes_at: '20:00', work_days: '1,2,3,4,5' }
}

type ClinicValues = ReturnType<typeof initialValues>

function toPayload(values: ClinicValues): ClinicCreate {
  return {
    name: values.name.trim(),
    address: values.address.trim(),
    phone: normalizePhone(values.phone),
    opens_at: values.opens_at,
    closes_at: values.closes_at,
    work_days: parseWorkDays(values.work_days),
  }
}

/** Только изменённые поля: PATCH не перезаписывает то, что администратор не трогал. */
function changedFields(next: ClinicCreate, clinic: AdminClinic): ClinicUpdate {
  const update: ClinicUpdate = {}
  if (next.name !== clinic.name) update.name = next.name
  if (next.address !== clinic.address) update.address = next.address
  if (next.phone !== clinic.phone) update.phone = next.phone
  if (next.opens_at !== clinic.opens_at) update.opens_at = next.opens_at
  if (next.closes_at !== clinic.closes_at) update.closes_at = next.closes_at
  if (serializeWorkDays(next.work_days) !== serializeWorkDays(clinic.work_days)) update.work_days = next.work_days
  return update
}

interface ClinicFormProps {
  clinic?: AdminClinic
  onSaved: (clinic: AdminClinic) => void
  onCancel: () => void
  /** Запрос идёт: окно нельзя закрыть, иначе клиника сохранится, а ответ или ошибку показать будет некому. */
  onBusyChange: (busy: boolean) => void
}

function ClinicForm({ clinic, onSaved, onCancel, onBusyChange }: ClinicFormProps) {
  const queryClient = useQueryClient()
  // Поля заполнены данными на момент открытия; сравнивать с обновившимся кэшем нельзя:
  // PATCH унёс бы старое значение поля, которое другой администратор уже поменял.
  const [baseline] = useState(clinic)
  const form = useForm({
    initial: initialValues(baseline),
    validate: (values) => {
      const phone = normalizePhone(values.phone)
      let phoneError: string | undefined
      if (values.phone.trim() === '') phoneError = validationMessages.required
      else if (!PHONE.test(phone)) phoneError = validationMessages.phone
      return {
        name: values.name.trim() ? undefined : validationMessages.required,
        address: values.address.trim() ? undefined : validationMessages.required,
        phone: phoneError,
        closes_at: values.opens_at < values.closes_at ? undefined : validationMessages.closesAfterOpens,
        work_days: parseWorkDays(values.work_days).length > 0 ? undefined : validationMessages.workDays,
      }
    },
    context: 'clinic',
    onSubmit: async (values) => {
      const payload = toPayload(values)
      const update = baseline && changedFields(payload, baseline)
      if (update && Object.keys(update).length === 0) {
        onCancel()
        return
      }
      onBusyChange(true)
      try {
        const request =
          baseline && update
            ? unwrap(api.PATCH('/admin/clinics/{id}', { params: { path: { id: baseline.id } }, body: update }))
            : unwrap(api.POST('/admin/clinics', { body: payload }))
        const saved = await request.catch((error: unknown) => {
          refetchAfterFailure(queryClient, baseline?.id)
          throw error
        })
        storeClinic(queryClient, saved)
        onSaved(saved)
      } finally {
        onBusyChange(false)
      }
    },
  })

  // Не disabled и без действия на время запроса: отправленное не отменить, а окно должно дождаться ответа.
  function cancel() {
    if (!form.submitting) onCancel()
  }

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
      <TextField label="Название" maxLength={clinicLimits.nameMax} {...form.field('name')} />
      <TextField label="Адрес" maxLength={clinicLimits.addressMax} {...form.field('address')} />
      <TextField
        label="Телефон"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        hint="+7 и 10 цифр"
        {...form.field('phone')}
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Открытие" options={timeOptions} {...form.field('opens_at')} />
        <SelectField label="Закрытие" options={timeOptions} {...form.field('closes_at')} />
      </div>
      <WorkDaysField
        value={form.values.work_days}
        onChange={(next) => form.setValue('work_days', next)}
        error={form.field('work_days').error}
      />
      {baseline && (
        <p className="text-sm text-ink-muted">Существующие записи не меняются, новые слоты считаются по новым часам.</p>
      )}
      <FormAlert message={form.formError} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" aria-disabled={form.submitting} onClick={cancel}>
          Отмена
        </Button>
        {/* Не disabled: с выключенной кнопки фокус уходит на body. Повторную отправку отсекает useForm. */}
        <Button type="submit" aria-disabled={form.submitting}>
          {form.submitting ? 'Сохраняем…' : baseline ? 'Сохранить' : 'Добавить клинику'}
        </Button>
      </div>
    </form>
  )
}

interface WorkDaysFieldProps {
  value: string
  onChange: (value: string) => void
  error?: ReactNode
}

/**
 * fieldset с name: useForm ставит на него фокус при ошибке, скринридер прочитает легенду и ошибку.
 * Без outline-none: рамку фокуса рисует общий :focus-visible.
 */
function WorkDaysField({ value, onChange, error }: WorkDaysFieldProps) {
  const errorId = useId()
  const days = parseWorkDays(value)

  function toggle(day: number, checked: boolean) {
    onChange(serializeWorkDays(checked ? [...days, day] : days.filter((item) => item !== day)))
  }

  return (
    <fieldset name="work_days" tabIndex={-1} aria-describedby={error ? errorId : undefined}>
      <legend className="text-sm font-bold text-ink">Рабочие дни</legend>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
        {weekdayShort.map((label, index) => (
          <CheckboxField
            key={label}
            label={label}
            checked={days.includes(index + 1)}
            onChange={(event) => toggle(index + 1, event.target.checked)}
          />
        ))}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-xs font-bold text-coral-ink">
          {error}
        </p>
      )}
    </fieldset>
  )
}
