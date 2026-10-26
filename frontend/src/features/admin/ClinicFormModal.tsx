import { useQueryClient } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'
import { api } from '../../api/client'
import { validationMessages } from '../../api/error-messages'
import { clinicLimits } from '../../api/limits'
import { unwrap } from '../../api/queries'
import type { AdminClinic, ClinicCreate } from '../../api/schema'
import { CheckboxField, FormActions, Modal, SelectField, TextField } from '../../components/ui'
import { changedFields } from '../../lib/changed-fields'
import { useForm } from '../../lib/use-form'
import { requiredError } from '../../lib/checks'
import { saveClinic } from './clinic-cache'
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

// Рабочие дни — набор: порядок и повторы в массиве не важны.
const sameWorkDays = (a: number[], b: number[]) => serializeWorkDays(a) === serializeWorkDays(b)

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
    validate: (values) => ({
      name: requiredError(values.name),
      address: requiredError(values.address),
      phone:
        requiredError(values.phone) ?? (PHONE.test(normalizePhone(values.phone)) ? undefined : validationMessages.phone),
      closes_at: values.opens_at < values.closes_at ? undefined : validationMessages.closesAfterOpens,
      work_days: parseWorkDays(values.work_days).length > 0 ? undefined : validationMessages.workDays,
    }),
    onBusyChange,
    onSubmit: async (values) => {
      const payload = toPayload(values)
      const update = baseline && changedFields(payload, baseline, { work_days: sameWorkDays })
      if (update && Object.keys(update).length === 0) {
        onCancel()
        return
      }
      const request =
        baseline && update
          ? unwrap(api.PATCH('/admin/clinics/{id}', { params: { path: { id: baseline.id } }, body: update }))
          : unwrap(api.POST('/admin/clinics', { body: payload }))
      onSaved(await saveClinic(queryClient, request, baseline?.id))
    },
  })

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
      <FormActions
        error={form.formError}
        submitting={form.submitting}
        submitLabel={baseline ? 'Сохранить' : 'Добавить клинику'}
        submittingLabel="Сохраняем…"
        onCancel={onCancel}
      />
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
