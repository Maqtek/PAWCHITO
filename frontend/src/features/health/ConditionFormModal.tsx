import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api/client'
import { validationMessages } from '../../api/error-messages'
import { healthLimits } from '../../api/limits'
import { queryKeys, unwrap } from '../../api/queries'
import type { Condition, ConditionCreate, ConditionKind, ConditionUpdate } from '../../api/schema'
import { REQUEST_TIMEOUT_MS } from '../../api/session'
import { Button, FormAlert, Modal, SelectField, TextareaField, TextField, type SelectOption } from '../../components/ui'
import { conditionKindLabel } from '../../lib/labels'
import { useForm } from '../../lib/use-form'
import { refetchAfterFailure, storeRecord } from './health-cache'

const kindOptions: SelectOption[] = (['allergy', 'chronic'] as const).map((value) => ({
  value,
  label: conditionKindLabel[value],
}))

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

/** Только изменённые поля: PATCH не перезаписывает то, что владелец не трогал. */
function changedFields(next: ConditionCreate, condition: Condition): ConditionUpdate {
  const update: ConditionUpdate = {}
  if (next.kind !== condition.kind) update.kind = next.kind
  if (next.title !== condition.title) update.title = next.title
  if (next.description !== condition.description) update.description = next.description
  return update
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
      title: values.title.trim() ? undefined : validationMessages.required,
    }),
    context: 'health',
    onSubmit: async (values) => {
      const payload = toPayload(values)
      const update = baseline && changedFields(payload, baseline)
      if (update && Object.keys(update).length === 0) {
        onCancel()
        return
      }
      onBusyChange(true)
      try {
        const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        const request =
          baseline && update
            ? unwrap(
                api.PATCH('/pets/{pet_id}/conditions/{id}', {
                  params: { path: { pet_id: petId, id: baseline.id } },
                  body: update,
                  signal,
                }),
              )
            : unwrap(api.POST('/pets/{pet_id}/conditions', { params: { path: { pet_id: petId } }, body: payload, signal }))
        const saved = await request.catch((error: unknown) => {
          refetchAfterFailure(queryClient, queryKey)
          throw error
        })
        storeRecord(queryClient, queryKey, saved)
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
      <SelectField label="Тип" options={kindOptions} placeholder="Выберите тип" {...form.field('kind')} />
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
      <FormAlert message={form.formError} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" aria-disabled={form.submitting} onClick={cancel}>
          Отмена
        </Button>
        {/* Не disabled: с выключенной кнопки фокус уходит на body. Повторную отправку отсекает useForm. */}
        <Button type="submit" aria-disabled={form.submitting}>
          {form.submitting ? 'Сохраняем…' : baseline ? 'Сохранить' : 'Добавить'}
        </Button>
      </div>
    </form>
  )
}
