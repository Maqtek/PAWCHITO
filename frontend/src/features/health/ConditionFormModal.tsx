import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api/client'
import { validationMessages } from '../../api/error-messages'
import { healthLimits } from '../../api/limits'
import { queryKeys, unwrap } from '../../api/queries'
import type { Condition, ConditionCreate, ConditionKind } from '../../api/schema'
import { FormActions, Modal, SelectField, TextareaField, TextField } from '../../components/ui'
import { changedFields } from '../../lib/changed-fields'
import { conditionKindOptions } from '../../lib/labels'
import { useForm } from '../../lib/use-form'
import { requiredError } from '../../lib/checks'
import { saveRecord } from './health-cache'

interface ConditionFormModalProps {
  open: boolean
  petId: number
  /** Нет записи — добавление, есть — изменение. */
  condition?: Condition
  onClose: () => void
  onSaved: (condition: Condition) => void
}

export function ConditionFormModal({ open, petId, condition, onClose, onSaved }: ConditionFormModalProps) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={condition ? 'Изменить особенность здоровья' : 'Новая особенность здоровья'}
      dismissible={!busy}
    >
      {/* Форма монтируется при каждом открытии — поля из текущих данных, прошлые ошибки не остаются. */}
      {open && (
        <ConditionForm petId={petId} condition={condition} onSaved={onSaved} onCancel={onClose} onBusyChange={setBusy} />
      )}
    </Modal>
  )
}

function initialValues(condition?: Condition) {
  return { kind: condition?.kind ?? '', title: condition?.title ?? '', description: condition?.description ?? '' }
}

type ConditionValues = ReturnType<typeof initialValues>

/** Пустой комментарий уходит как null — «нет комментария» (Р-44). */
function toPayload(values: ConditionValues): ConditionCreate {
  const description = values.description.trim()
  return { kind: values.kind as ConditionKind, title: values.title.trim(), description: description === '' ? null : description }
}

interface ConditionFormProps {
  petId: number
  condition?: Condition
  onSaved: (condition: Condition) => void
  onCancel: () => void
  /** Запрос идёт: окно нельзя закрыть, иначе запись сохранится, а ответ или ошибку показать будет некому. */
  onBusyChange: (busy: boolean) => void
}

function ConditionForm({ petId, condition, onSaved, onCancel, onBusyChange }: ConditionFormProps) {
  const queryClient = useQueryClient()
  // Поля заполнены данными на момент открытия: PATCH не должен унести значение, уже изменённое в другой вкладке.
  const [baseline] = useState(condition)
  const queryKey = queryKeys.conditions(petId)
  const form = useForm({
    initial: initialValues(baseline),
    validate: (values) => ({
      kind: values.kind ? undefined : validationMessages.conditionKind,
      title: requiredError(values.title),
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
              api.PATCH('/pets/{pet_id}/conditions/{id}', {
                params: { path: { pet_id: petId, id: baseline.id } },
                body: update,
              }),
            )
          : unwrap(api.POST('/pets/{pet_id}/conditions', { params: { path: { pet_id: petId } }, body: payload }))
      const saved = await saveRecord(queryClient, queryKey, request)
      onSaved(saved)
    },
  })

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
      <SelectField label="Тип" options={conditionKindOptions} placeholder="Выберите тип" {...form.field('kind')} />
      <TextField
        label="Название"
        hint="Например, «Аллергия на курицу»"
        autoComplete="off"
        maxLength={healthLimits.conditionTitleMax}
        {...form.field('title')}
      />
      <TextareaField
        label="Комментарий"
        hint="Необязательно: как проявляется, что помогает"
        rows={3}
        maxLength={healthLimits.conditionDescriptionMax}
        {...form.field('description')}
      />
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
