import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api/client'
import { validationMessages } from '../../api/error-messages'
import { vetLimits } from '../../api/limits'
import { unwrap } from '../../api/queries'
import type { Vet, VetCreate, VetUpdate } from '../../api/schema'
import { FormActions, Modal, TextField } from '../../components/ui'
import { useForm } from '../../lib/use-form'
import { refetchVetsAfterFailure, storeVet } from './vet-cache'

interface VetFormModalProps {
  open: boolean
  onClose: () => void
  /** Нет врача — добавление, есть — изменение. */
  vet?: Vet
  onSaved: (vet: Vet) => void
}

export function VetFormModal({ open, onClose, vet, onSaved }: VetFormModalProps) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal open={open} onClose={onClose} title={vet ? 'Изменить данные врача' : 'Новый врач'} dismissible={!busy}>
      {/* Форма монтируется при каждом открытии — поля из текущих данных, прошлые ошибки не остаются. */}
      {open && <VetForm vet={vet} onSaved={onSaved} onCancel={onClose} onBusyChange={setBusy} />}
    </Modal>
  )
}

function initialValues(vet?: Vet) {
  return { full_name: vet?.full_name ?? '', specialization: vet?.specialization ?? '' }
}

type VetValues = ReturnType<typeof initialValues>

/** Пустая специализация уходит как null — «не указана» (Р-38). */
function toPayload(values: VetValues): VetCreate {
  const specialization = values.specialization.trim()
  return { full_name: values.full_name.trim(), specialization: specialization === '' ? null : specialization }
}

/** Только изменённые поля: PATCH не перезаписывает то, что клиника не трогала. */
function changedFields(next: VetCreate, vet: Vet): VetUpdate {
  const update: VetUpdate = {}
  if (next.full_name !== vet.full_name) update.full_name = next.full_name
  if (next.specialization !== vet.specialization) update.specialization = next.specialization
  return update
}

interface VetFormProps {
  vet?: Vet
  onSaved: (vet: Vet) => void
  onCancel: () => void
  /** Запрос идёт: окно нельзя закрыть, иначе врач сохранится, а ответ или ошибку показать будет некому. */
  onBusyChange: (busy: boolean) => void
}

function VetForm({ vet, onSaved, onCancel, onBusyChange }: VetFormProps) {
  const queryClient = useQueryClient()
  // Поля заполнены данными на момент открытия; сравнивать с обновившимся кэшем нельзя:
  // PATCH унёс бы старое значение поля, которое уже поменяли в другой вкладке.
  const [baseline] = useState(vet)
  const form = useForm({
    initial: initialValues(baseline),
    validate: (values) => ({ full_name: values.full_name.trim() ? undefined : validationMessages.required }),
    context: 'vet',
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
          ? unwrap(api.PATCH('/clinic/vets/{id}', { params: { path: { id: baseline.id } }, body: update }))
          : unwrap(api.POST('/clinic/vets', { body: payload }))
      const saved = await request.catch((error: unknown) => {
        refetchVetsAfterFailure(queryClient)
        throw error
      })
      storeVet(queryClient, saved)
      onSaved(saved)
    },
  })

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
      <TextField label="ФИО" autoComplete="off" maxLength={vetLimits.fullNameMax} {...form.field('full_name')} />
      <TextField
        label="Специализация"
        hint="Необязательно, например «терапевт»"
        autoComplete="off"
        maxLength={vetLimits.specializationMax}
        {...form.field('specialization')}
      />
      <FormActions
        error={form.formError}
        submitting={form.submitting}
        submitLabel={baseline ? 'Сохранить' : 'Добавить врача'}
        submittingLabel="Сохраняем…"
        onCancel={onCancel}
      />
    </form>
  )
}
