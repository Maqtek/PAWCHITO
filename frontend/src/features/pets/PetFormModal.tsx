import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api/client'
import { validationMessages } from '../../api/error-messages'
import { petLimits } from '../../api/limits'
import { unwrap } from '../../api/queries'
import type { Pet, PetCreate, PetUpdate, Sex, Species } from '../../api/schema'
import { Button, FormAlert, Modal, SelectField, TextField, type SelectOption } from '../../components/ui'
import { moscowIsoDate } from '../../lib/format'
import { sexLabel, speciesLabel } from '../../lib/labels'
import { useForm } from '../../lib/use-form'
import { refetchPetsAfterFailure, storePet } from './pet-cache'

const speciesOptions: SelectOption[] = (['dog', 'cat', 'other'] as const).map((value) => ({
  value,
  label: speciesLabel[value],
}))

// «Не указан» первым: это значение по умолчанию (Р-41).
const sexOptions: SelectOption[] = (['unknown', 'male', 'female'] as const).map((value) => ({ value, label: sexLabel[value] }))

interface PetFormModalProps {
  open: boolean
  onClose: () => void
  /** Нет питомца — добавление, есть — изменение. */
  pet?: Pet
  onSaved: (pet: Pet) => void
}

export function PetFormModal({ open, onClose, pet, onSaved }: PetFormModalProps) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal open={open} onClose={onClose} title={pet ? 'Изменить данные питомца' : 'Новый питомец'} dismissible={!busy}>
      {/* Форма монтируется при каждом открытии — поля из текущих данных, прошлые ошибки не остаются. */}
      {open && <PetForm pet={pet} onSaved={onSaved} onCancel={onClose} onBusyChange={setBusy} />}
    </Modal>
  )
}

function initialValues(pet?: Pet) {
  return {
    name: pet?.name ?? '',
    // У нового питомца вид не выбран: выбор по умолчанию легко пропустить, а вид меняет иллюстрацию.
    species: pet?.species ?? '',
    breed: pet?.breed ?? '',
    birth_date: pet?.birth_date ?? '',
    sex: pet?.sex ?? 'unknown',
  }
}

type PetValues = ReturnType<typeof initialValues>

/** Пустые порода и дата рождения уходят как null — «не указаны» (Р-41). */
function toPayload(values: PetValues): PetCreate {
  const breed = values.breed.trim()
  return {
    name: values.name.trim(),
    species: values.species as Species,
    breed: breed === '' ? null : breed,
    birth_date: values.birth_date === '' ? null : values.birth_date,
    sex: values.sex as Sex,
  }
}

/** Только изменённые поля: PATCH не перезаписывает то, что владелец не трогал. */
function changedFields(next: PetCreate, pet: Pet): PetUpdate {
  const update: PetUpdate = {}
  if (next.name !== pet.name) update.name = next.name
  if (next.species !== pet.species) update.species = next.species
  if (next.breed !== pet.breed) update.breed = next.breed
  if (next.birth_date !== pet.birth_date) update.birth_date = next.birth_date
  if (next.sex !== pet.sex) update.sex = next.sex
  return update
}

/** Те же границы, что у сервера: не раньше 1900-01-01 и не позже сегодняшнего дня по Москве. */
function birthDateError(value: string, today: string): string | undefined {
  if (value === '') return undefined
  if (value > today) return validationMessages.birthDateFuture
  return value < petLimits.birthDateMin ? validationMessages.birthDateTooEarly : undefined
}

interface PetFormProps {
  pet?: Pet
  onSaved: (pet: Pet) => void
  onCancel: () => void
  /** Запрос идёт: окно нельзя закрыть, иначе питомец сохранится, а ответ или ошибку показать будет некому. */
  onBusyChange: (busy: boolean) => void
}

function PetForm({ pet, onSaved, onCancel, onBusyChange }: PetFormProps) {
  const queryClient = useQueryClient()
  // Поля заполнены данными на момент открытия; сравнивать с обновившимся кэшем нельзя:
  // PATCH унёс бы старое значение поля, которое уже поменяли в другой вкладке.
  const [baseline] = useState(pet)
  const [today] = useState(() => moscowIsoDate(new Date()))
  const form = useForm({
    initial: initialValues(baseline),
    validate: (values) => ({
      name: values.name.trim() ? undefined : validationMessages.required,
      species: values.species ? undefined : validationMessages.species,
      birth_date: birthDateError(values.birth_date, today),
    }),
    context: 'pet',
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
            ? unwrap(api.PATCH('/pets/{pet_id}', { params: { path: { pet_id: baseline.id } }, body: update }))
            : unwrap(api.POST('/pets', { body: payload }))
        const saved = await request.catch((error: unknown) => {
          refetchPetsAfterFailure(queryClient)
          throw error
        })
        storePet(queryClient, saved)
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
      <TextField label="Кличка" autoComplete="off" maxLength={petLimits.nameMax} {...form.field('name')} />
      <SelectField label="Вид" options={speciesOptions} placeholder="Выберите вид" {...form.field('species')} />
      <TextField
        label="Порода"
        hint="Необязательно"
        autoComplete="off"
        maxLength={petLimits.breedMax}
        {...form.field('breed')}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Дата рождения"
          hint="Необязательно, по ней считается возраст"
          type="date"
          min={petLimits.birthDateMin}
          max={today}
          {...form.field('birth_date')}
        />
        <SelectField label="Пол" options={sexOptions} {...form.field('sex')} />
      </div>
      <FormAlert message={form.formError} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" aria-disabled={form.submitting} onClick={cancel}>
          Отмена
        </Button>
        {/* Не disabled: с выключенной кнопки фокус уходит на body. Повторную отправку отсекает useForm. */}
        <Button type="submit" aria-disabled={form.submitting}>
          {form.submitting ? 'Сохраняем…' : baseline ? 'Сохранить' : 'Добавить питомца'}
        </Button>
      </div>
    </form>
  )
}
