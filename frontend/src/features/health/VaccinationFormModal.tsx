import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api/client'
import { validationMessages } from '../../api/error-messages'
import { healthLimits } from '../../api/limits'
import { queryKeys, unwrap } from '../../api/queries'
import type { Vaccination, VaccinationCreate } from '../../api/schema'
import { FormActions, Modal, TextField } from '../../components/ui'
import { changedFields } from '../../lib/changed-fields'
import { moscowIsoDate } from '../../lib/format'
import { useForm } from '../../lib/use-form'
import { requiredError } from '../../lib/checks'
import { dateError } from './date-error'
import { saveRecord } from './health-cache'

interface VaccinationFormModalProps {
  open: boolean
  petId: number
  /** Нет прививки — внесение из ветпаспорта, есть — изменение своей. */
  vaccination?: Vaccination
  onClose: () => void
  onSaved: (vaccination: Vaccination) => void
}

export function VaccinationFormModal({ open, petId, vaccination, onClose, onSaved }: VaccinationFormModalProps) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={vaccination ? 'Изменить прививку' : 'Прививка из ветпаспорта'}
      dismissible={!busy}
    >
      {/* Форма монтируется при каждом открытии — поля из текущих данных, прошлые ошибки не остаются. */}
      {open && (
        <VaccinationForm
          petId={petId}
          vaccination={vaccination}
          onSaved={onSaved}
          onCancel={onClose}
          onBusyChange={setBusy}
        />
      )}
    </Modal>
  )
}

function initialValues(vaccination?: Vaccination) {
  return { name: vaccination?.name ?? '', date: vaccination?.date ?? '', next_date: vaccination?.next_date ?? '' }
}

type VaccinationValues = ReturnType<typeof initialValues>

/** Пустая следующая дата уходит как null — «не запланирована» (Р-46). */
function toPayload(values: VaccinationValues): Required<VaccinationCreate> {
  return { name: values.name.trim(), date: values.date, next_date: values.next_date === '' ? null : values.next_date }
}

interface VaccinationFormProps {
  petId: number
  vaccination?: Vaccination
  onSaved: (vaccination: Vaccination) => void
  onCancel: () => void
  /** Запрос идёт: окно нельзя закрыть, иначе запись сохранится, а ответ или ошибку показать будет некому. */
  onBusyChange: (busy: boolean) => void
}

function VaccinationForm({ petId, vaccination, onSaved, onCancel, onBusyChange }: VaccinationFormProps) {
  const queryClient = useQueryClient()
  const [baseline] = useState(vaccination)
  const [today] = useState(() => moscowIsoDate(new Date()))
  const queryKey = queryKeys.vaccinations(petId)
  const form = useForm({
    initial: initialValues(baseline),
    validate: (values) => ({
      name: requiredError(values.name),
      date: dateError(values.date, today),
      // Следующая может быть и в прошлом — тогда прививка просрочена (Р-46); главное — позже самой прививки.
      next_date:
        values.next_date !== '' && values.date !== '' && values.next_date <= values.date
          ? validationMessages.nextDateAfter
          : undefined,
    }),
    context: 'health',
    onBusyChange,
    onSubmit: async (values) => {
      const payload = toPayload(values)
      const update = baseline && changedFields(payload, baseline)
      if (update && Object.keys(update).length === 0) {
        onCancel()
        return
      }
      const request =
        baseline && update
          ? unwrap(
              api.PATCH('/pets/{pet_id}/vaccinations/{id}', {
                params: { path: { pet_id: petId, id: baseline.id } },
                body: update,
              }),
            )
          : unwrap(api.POST('/pets/{pet_id}/vaccinations', { params: { path: { pet_id: petId } }, body: payload }))
      const saved = await saveRecord(queryClient, queryKey, request, { prepend: true })
      onSaved(saved)
    },
  })

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
      <TextField
        label="Название"
        hint="Как в ветпаспорте, например «Нобивак Rabies»"
        autoComplete="off"
        maxLength={healthLimits.vaccineNameMax}
        {...form.field('name')}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Дата прививки" type="date" min={healthLimits.dateMin} max={today} {...form.field('date')} />
        <TextField
          label="Следующая прививка"
          hint="Необязательно — попадёт в календарь"
          type="date"
          min={form.values.date || healthLimits.dateMin}
          {...form.field('next_date')}
        />
      </div>
      <FormActions
        error={form.formError}
        submitting={form.submitting}
        submitLabel={baseline ? 'Сохранить' : 'Добавить'}
        submittingLabel="Сохраняем…"
        onCancel={onCancel}
      />
    </form>
  )
}
