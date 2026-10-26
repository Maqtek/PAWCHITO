import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api/client'
import { validationMessages } from '../../api/error-messages'
import { healthLimits } from '../../api/limits'
import { queryKeys, unwrap } from '../../api/queries'
import type { Level, Observation, ObservationCreate, ObservationUpdate } from '../../api/schema'
import { FormActions, Modal, SelectField, TextareaField, TextField, type SelectOption } from '../../components/ui'
import { moscowIsoDate } from '../../lib/format'
import { levelLabel } from '../../lib/labels'
import { useForm } from '../../lib/use-form'
import { refetchAfterFailure, storeRecord } from './health-cache'
import { parseWeight, weightText } from './weight'

const levelOptions: SelectOption[] = [
  { value: '', label: 'Не отмечено' },
  ...(['low', 'normal', 'high'] as const).map((value) => ({ value, label: levelLabel[value] })),
]

interface ObservationFormModalProps {
  open: boolean
  petId: number
  /** Нет наблюдения — добавление, есть — правка своего наблюдения (Р-43). */
  observation?: Observation
  onClose: () => void
  onSaved: (observation: Observation) => void
}

export function ObservationFormModal({ open, petId, observation, onClose, onSaved }: ObservationFormModalProps) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal open={open} onClose={onClose} title={observation ? 'Изменить наблюдение' : 'Новое наблюдение'} dismissible={!busy}>
      {/* Форма монтируется при каждом открытии — поля из текущих данных, прошлые ошибки не остаются. */}
      {open && (
        <ObservationForm
          petId={petId}
          observation={observation}
          onSaved={onSaved}
          onCancel={onClose}
          onBusyChange={setBusy}
        />
      )}
    </Modal>
  )
}

function initialValues(today: string, observation?: Observation) {
  return {
    // Новое наблюдение — обычно о сегодняшнем дне.
    date: observation?.date ?? today,
    weight: weightText(observation?.weight),
    appetite: observation?.appetite ?? '',
    energy: observation?.energy ?? '',
    symptoms: observation?.symptoms ?? '',
    note: observation?.note ?? '',
  }
}

type ObservationValues = ReturnType<typeof initialValues>

const textOrNull = (value: string) => (value.trim() === '' ? null : value.trim())
const levelOrNull = (value: string) => (value === '' ? null : (value as Level))

/** Пустые поля уходят как null — «не отмечено» (Р-45). Вес к этому моменту уже проверен. */
function toPayload(values: ObservationValues): Required<ObservationCreate> {
  return {
    date: values.date,
    weight: parseWeight(values.weight) ?? null,
    appetite: levelOrNull(values.appetite),
    energy: levelOrNull(values.energy),
    symptoms: textOrNull(values.symptoms),
    note: textOrNull(values.note),
  }
}

/** Только изменённые поля: PATCH не перезаписывает то, что владелец не трогал. */
function changedFields(next: Required<ObservationCreate>, observation: Observation): ObservationUpdate {
  const update: ObservationUpdate = {}
  for (const field of ['date', 'weight', 'appetite', 'energy', 'symptoms', 'note'] as const) {
    if (next[field] !== observation[field]) Object.assign(update, { [field]: next[field] })
  }
  return update
}

function dateError(value: string, today: string): string | undefined {
  if (value === '') return validationMessages.required
  if (value > today) return validationMessages.dateFuture
  return value < healthLimits.dateMin ? validationMessages.dateTooEarly : undefined
}

interface ObservationFormProps {
  petId: number
  observation?: Observation
  onSaved: (observation: Observation) => void
  onCancel: () => void
  /** Запрос идёт: окно нельзя закрыть, иначе запись сохранится, а ответ или ошибку показать будет некому. */
  onBusyChange: (busy: boolean) => void
}

function ObservationForm({ petId, observation, onSaved, onCancel, onBusyChange }: ObservationFormProps) {
  const queryClient = useQueryClient()
  const [baseline] = useState(observation)
  const [today] = useState(() => moscowIsoDate(new Date()))
  const queryKey = queryKeys.observations(petId)
  const form = useForm({
    initial: initialValues(today, baseline),
    validate: (values) => {
      const filled = Object.values({ ...toPayload(values), date: null }).some((value) => value !== null)
      const weightInvalid = values.weight.trim() !== '' && parseWeight(values.weight) === undefined
      return {
        date: dateError(values.date, today),
        // «Хотя бы одно поле» — у первого поля наблюдения: туда и уйдёт фокус.
        weight: weightInvalid ? validationMessages.weight : filled ? undefined : validationMessages.observationEmpty,
      }
    },
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
              api.PATCH('/pets/{pet_id}/observations/{id}', {
                params: { path: { pet_id: petId, id: baseline.id } },
                body: update,
              }),
            )
          : unwrap(api.POST('/pets/{pet_id}/observations', { params: { path: { pet_id: petId } }, body: payload }))
      const saved = await request.catch((error: unknown) => {
        refetchAfterFailure(queryClient, queryKey)
        throw error
      })
      storeRecord(queryClient, queryKey, saved, { prepend: true })
      onSaved(saved)
    },
  })

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Дата" type="date" min={healthLimits.dateMin} max={today} {...form.field('date')} />
        <TextField label="Вес" hint="В килограммах, например 4,2" inputMode="decimal" autoComplete="off" {...form.field('weight')} />
        <SelectField label="Аппетит" options={levelOptions} {...form.field('appetite')} />
        <SelectField label="Энергия" options={levelOptions} {...form.field('energy')} />
      </div>
      <TextareaField label="Симптомы" rows={2} maxLength={healthLimits.symptomsMax} {...form.field('symptoms')} />
      <TextareaField label="Заметка" rows={3} maxLength={healthLimits.noteMax} {...form.field('note')} />
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
