import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { api } from '../../api/client'
import { errorMessage, validationMessages } from '../../api/error-messages'
import { ApiError } from '../../api/errors'
import { healthLimits, outcomeLimits, petLimits } from '../../api/limits'
import { clinicPetQuery, unwrap } from '../../api/queries'
import type { Appointment, CareStatus, ConditionKind, OutcomeCreate, OutcomeResult, Pet, Sex } from '../../api/schema'
import { Button, FormActions, Modal, SelectField, TextareaField, TextField } from '../../components/ui'
import { addDays, moscowLocal } from '../../lib/dates'
import { moscowIsoDate } from '../../lib/format'
import { careStatusOptions, conditionKindOptions, sexOptions } from '../../lib/labels'
import { focusField } from '../../lib/use-form'
import { formatSlot } from '../appointments/format'
import { parseWeight } from '../health/weight'
import { refetchClinicAppointments } from './clinic-appointment-cache'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

interface OutcomeFormModalProps {
  open: boolean
  appointment?: Appointment
  onClose: () => void
  onDone: (result: OutcomeResult) => void
}

/** Итог приёма одной транзакцией (FR-19, БП §6): после сохранения не редактируется. */
export function OutcomeFormModal({ open, appointment, onClose, onDone }: OutcomeFormModalProps) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal open={open} onClose={onClose} title="Итог приёма" dismissible={!busy}>
      {open && appointment && (
        <OutcomeForm appointment={appointment} onBusyChange={setBusy} onCancel={onClose} onDone={onDone} />
      )}
    </Modal>
  )
}

// Черновик — значения полей ввода под именами полей OutcomeCreate: путь поля («prescriptions.0.times») — это и его имя,
// и путь ошибки сервера (Р-56).
type RowList = 'prescriptions' | 'vaccinations' | 'conditions'
type RowField<L extends RowList> = keyof NonNullable<OutcomeCreate[L]>[number] & string
type Row<L extends RowList> = { key: number } & Record<RowField<L>, string>
type PetField = keyof NonNullable<OutcomeCreate['pet_update']>
interface Draft extends Record<'conclusion' | 'recommendations' | 'care_status', string> {
  prescriptions: Row<'prescriptions'>[]
  vaccinations: Row<'vaccinations'>[]
  conditions: Row<'conditions'>[]
  /** Только правки: нетронутое поле подхватит значение из карточки, даже если она загрузилась после начала ввода. */
  pet_update: Partial<Record<PetField, string>>
}

const emptyDraft: Draft = {
  conclusion: '',
  recommendations: '',
  care_status: '',
  prescriptions: [],
  vaccinations: [],
  conditions: [],
  pet_update: {},
}

/** Значение по пути: «prescriptions.0.times». */
const getIn = (tree: object, path: string) =>
  path.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], tree) as string

/** Копия дерева с новым значением по пути; соседние ветви не копируются. */
function setIn(node: unknown, [part, ...rest]: string[], value: string): unknown {
  if (part === undefined) return value
  if (Array.isArray(node)) return node.with(Number(part), setIn(node[Number(part)], rest, value))
  const record = node as Record<string, unknown>
  return { ...record, [part]: setIn(record[part], rest, value) }
}

/** Время приёма в поле — «09:00, 21:00», через запятую. */
const parseTimes = (text: string) =>
  text
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)

/** Пустое — не передаётся; иначе «как есть», а проверка поля — на клиенте и на сервере (Р-56). */
function toPayload(draft: Draft, pet: Record<PetField, string>, current: Pet | undefined): OutcomeCreate {
  const { prescriptions, vaccinations, conditions } = draft
  const recommendations = draft.recommendations.trim()
  const update: OutcomeCreate['pet_update'] = {}
  const weight = parseWeight(pet.weight)
  if (typeof weight === 'number') update.weight = weight
  // Данные питомца уходят, только если клиника их изменила: уведомление владельцу говорит, что именно (БП §6.4).
  if (current) {
    const breed = pet.breed.trim() === '' ? null : pet.breed.trim()
    if (breed !== current.breed) update.breed = breed
    const birthDate = pet.birth_date === '' ? null : pet.birth_date
    if (birthDate !== current.birth_date) update.birth_date = birthDate
    if (pet.sex !== current.sex) update.sex = pet.sex as Sex
  }
  return {
    conclusion: draft.conclusion.trim(),
    recommendations: recommendations === '' ? null : recommendations,
    care_status: draft.care_status as CareStatus,
    ...(prescriptions.length > 0 && {
      prescriptions: prescriptions.map((item) => ({
        drug: item.drug.trim(),
        dosage: item.dosage.trim(),
        times: parseTimes(item.times),
        duration_days: Number(item.duration_days),
        start_date: item.start_date,
      })),
    }),
    ...(vaccinations.length > 0 && {
      vaccinations: vaccinations.map((item) => ({
        name: item.name.trim(),
        date: item.date,
        next_date: item.next_date || null,
      })),
    }),
    ...(conditions.length > 0 && {
      conditions: conditions.map((item) => ({
        kind: item.kind as ConditionKind,
        title: item.title.trim(),
        description: item.description.trim() || null,
      })),
    }),
    ...(Object.keys(update).length > 0 && { pet_update: update }),
  }
}

interface OutcomeFormProps {
  appointment: Appointment
  /** Запрос идёт: окно нельзя закрыть, иначе итог сохранится, а ответ или ошибку показать будет некому. */
  onBusyChange: (busy: boolean) => void
  onCancel: () => void
  onDone: (result: OutcomeResult) => void
}

function OutcomeForm({ appointment, onBusyChange, onCancel, onDone }: OutcomeFormProps) {
  const queryClient = useQueryClient()
  const { data: card } = useQuery(clinicPetQuery(appointment.pet.id))
  const [today] = useState(() => moscowIsoDate(new Date()))
  const day = moscowLocal(new Date(appointment.slot_start)).date
  const nextKey = useRef(1)

  const [draft, setDraft] = useState(emptyDraft)
  // Данные питомца — из карточки: поля заполнены текущими значениями, уходят только изменённые.
  const { pet_update: edits } = draft
  const pet = {
    weight: edits.weight ?? '',
    breed: edits.breed ?? card?.pet.breed ?? '',
    birth_date: edits.birth_date ?? card?.pet.birth_date ?? '',
    sex: edits.sex ?? card?.pet.sex ?? 'unknown',
  }
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  /** Ошибки по путям, как у сервера: «prescriptions.0.times» (Р-56). */
  function validate(): Record<string, string> {
    const found: Record<string, string> = {}
    if (!draft.conclusion.trim()) found.conclusion = 'Напишите заключение'
    if (!draft.care_status) found.care_status = 'Выберите статус ухода'
    draft.prescriptions.forEach((item, index) => {
      const at = (field: RowField<'prescriptions'>) => `prescriptions.${index}.${field}`
      if (!item.drug.trim()) found[at('drug')] = validationMessages.required
      if (!item.dosage.trim()) found[at('dosage')] = validationMessages.required
      const times = parseTimes(item.times)
      if (times.length === 0 || times.length > outcomeLimits.timesMax || !times.every((time) => TIME.test(time))) {
        found[at('times')] = `Время ЧЧ:ММ через запятую, от 1 до ${outcomeLimits.timesMax}`
      } else if (new Set(times).size !== times.length) {
        found[at('times')] = 'Время приёма не должно повторяться'
      }
      const days = Number(item.duration_days)
      if (!Number.isInteger(days) || days < 1 || days > outcomeLimits.durationMax) {
        found[at('duration_days')] = `От 1 до ${outcomeLimits.durationMax} дней`
      }
      if (!item.start_date || item.start_date < day || item.start_date > addDays(day, outcomeLimits.startDaysMax)) {
        found[at('start_date')] = 'От дня приёма до 30 дней после'
      }
    })
    draft.vaccinations.forEach((item, index) => {
      const at = (field: RowField<'vaccinations'>) => `vaccinations.${index}.${field}`
      if (!item.name.trim()) found[at('name')] = validationMessages.required
      if (!item.date || item.date < day || item.date > today) found[at('date')] = 'От дня приёма до сегодня'
      else if (item.next_date && item.next_date <= item.date) found[at('next_date')] = validationMessages.nextDateAfter
    })
    draft.conditions.forEach((item, index) => {
      if (!item.kind) found[`conditions.${index}.kind`] = validationMessages.conditionKind
      if (!item.title.trim()) found[`conditions.${index}.title`] = validationMessages.required
    })
    if (pet.weight.trim() !== '' && parseWeight(pet.weight) === undefined) {
      found['pet_update.weight'] = validationMessages.weight
    }
    if (pet.birth_date && pet.birth_date > today) found['pet_update.birth_date'] = validationMessages.birthDateFuture
    return found
  }

  // После первой отправки ошибки пересчитываются при вводе — как в useForm.
  const shown = submitted ? { ...errors, ...validate() } : errors
  const view = { ...draft, pet_update: pet }

  /** Поле по пути, как form.field(): путь — имя поля для фокуса и ключ ошибки; правка снимает ошибку сервера. */
  function bind(path: string) {
    return {
      name: path,
      value: getIn(view, path),
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { value } = event.target
        setDraft((current) => setIn(current, path.split('.'), value) as Draft)
        setErrors((current) => {
          if (!(path in current)) return current
          const next = { ...current }
          delete next[path]
          return next
        })
      },
      error: shown[path],
    }
  }

  function addRow<L extends RowList>(list: L, blank: Omit<Row<L>, 'key'>) {
    const row = { key: nextKey.current++, ...blank }
    setDraft((current) => ({ ...current, [list]: [...current[list], row] }))
  }

  /** Строки после убранной сдвигаются, и серверные ошибки по индексам указали бы не туда — сбрасываем их. */
  function removeRow(list: RowList, index: number) {
    setDraft((current) => ({ ...current, [list]: current[list].filter((_, at) => at !== index) }))
    setErrors({})
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const form = event.currentTarget
    setSubmitted(true)
    setFormError(null)
    const found = validate()
    setErrors({})
    const first = Object.keys(found)[0]
    if (first) {
      focusField(form, first)
      return
    }
    setSubmitting(true)
    onBusyChange(true)
    try {
      const result = await unwrap(
        api.POST('/clinic/appointments/{id}/outcome', {
          params: { path: { id: appointment.id } },
          body: toPayload(draft, pet, card?.pet),
        }),
      )
      onDone(result)
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setErrors(error.pathErrors)
        const path = Object.keys(error.pathErrors)[0]
        if (path) focusField(form, path)
      }
      setFormError(
        error instanceof ApiError && error.status === 409 ? `${error.detail}. Список записей обновлён.` : errorMessage(error),
      )
    } finally {
      setSubmitting(false)
      onBusyChange(false)
      refetchClinicAppointments(queryClient)
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      <p className="text-sm text-ink-muted">
        <span className="font-bold text-ink">{appointment.pet.name}</span>, {formatSlot(appointment.slot_start)},{' '}
        {appointment.vet.full_name}. После сохранения итог не меняется.
      </p>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 font-extrabold">Заключение и статус ухода</legend>
        <TextareaField label="Заключение" rows={3} maxLength={outcomeLimits.textMax} {...bind('conclusion')} />
        <TextareaField
          label="Рекомендации"
          hint="Необязательно"
          rows={2}
          maxLength={outcomeLimits.textMax}
          {...bind('recommendations')}
        />
        <SelectField
          label="Статус ухода"
          hint="Владелец увидит его на главной (БП §6.3)"
          options={careStatusOptions}
          placeholder="Выберите статус"
          {...bind('care_status')}
        />
      </fieldset>

      <DraftRows
        name="prescriptions"
        legend="Рецепты"
        intro="По каждому рецепту владелец получит дела курса на каждый день и время."
        item="рецепт"
        rows={draft.prescriptions}
        max={outcomeLimits.prescriptionsMax}
        onAdd={() =>
          addRow('prescriptions', { drug: '', dosage: '', times: '', duration_days: '7', start_date: day })
        }
        onRemove={(index) => removeRow('prescriptions', index)}
      >
        {(at) => (
          <>
            <TextField label="Препарат" maxLength={outcomeLimits.drugMax} {...bind(at('drug'))} />
            <TextField label="Дозировка" maxLength={outcomeLimits.dosageMax} {...bind(at('dosage'))} />
            <TextField label="Время приёма" hint="Через запятую: 09:00, 21:00" {...bind(at('times'))} />
            <TextField label="Дней" inputMode="numeric" {...bind(at('duration_days'))} />
            <TextField
              label="Начало"
              type="date"
              min={day}
              max={addDays(day, outcomeLimits.startDaysMax)}
              {...bind(at('start_date'))}
            />
          </>
        )}
      </DraftRows>

      <DraftRows
        name="vaccinations"
        legend="Прививки"
        item="прививку"
        rows={draft.vaccinations}
        max={outcomeLimits.vaccinationsMax}
        onAdd={() => addRow('vaccinations', { name: '', date: day, next_date: '' })}
        onRemove={(index) => removeRow('vaccinations', index)}
      >
        {(at) => (
          <>
            <TextField label="Название прививки" maxLength={healthLimits.vaccineNameMax} {...bind(at('name'))} />
            <TextField label="Дата прививки" type="date" min={day} max={today} {...bind(at('date'))} />
            <TextField label="Следующая прививка" hint="Необязательно" type="date" {...bind(at('next_date'))} />
          </>
        )}
      </DraftRows>

      <DraftRows
        name="conditions"
        legend="Особенности здоровья"
        item="особенность"
        rows={draft.conditions}
        max={outcomeLimits.conditionsMax}
        onAdd={() => addRow('conditions', { kind: '', title: '', description: '' })}
        onRemove={(index) => removeRow('conditions', index)}
      >
        {(at) => (
          <>
            <SelectField label="Тип" options={conditionKindOptions} placeholder="Выберите тип" {...bind(at('kind'))} />
            <TextField label="Название особенности" maxLength={healthLimits.conditionTitleMax} {...bind(at('title'))} />
            <TextareaField
              label="Комментарий"
              hint="Необязательно"
              rows={2}
              maxLength={healthLimits.conditionDescriptionMax}
              {...bind(at('description'))}
            />
          </>
        )}
      </DraftRows>

      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-extrabold">Данные питомца</legend>
        <TextField
          label="Вес"
          hint="В килограммах, например 4,2 — запишется в дневник"
          inputMode="decimal"
          {...bind('pet_update.weight')}
        />
        <TextField label="Порода" maxLength={petLimits.breedMax} {...bind('pet_update.breed')} />
        <TextField
          label="Дата рождения"
          type="date"
          min={petLimits.birthDateMin}
          max={today}
          {...bind('pet_update.birth_date')}
        />
        <SelectField label="Пол" options={sexOptions} {...bind('pet_update.sex')} />
      </fieldset>

      <FormActions
        error={formError}
        submitting={submitting}
        submitLabel="Сохранить итог"
        submittingLabel="Сохраняем…"
        onCancel={onCancel}
      />
    </form>
  )
}

interface DraftRowsProps<L extends RowList> {
  /** Список в API: поля строки — «prescriptions.0.times», как в пути ошибки сервера. */
  name: L
  legend: string
  /** Пояснение под заголовком. */
  intro?: string
  /** Что в строке, в винительном падеже: «Добавить рецепт», «Убрать рецепт 2». */
  item: string
  rows: Row<L>[]
  max: number
  onAdd: () => void
  onRemove: (index: number) => void
  /** Поля строки; at('times') — путь поля этой строки. */
  children: (at: (field: RowField<L>) => string) => ReactNode
}

/** Строки черновика (рецепты, прививки, особенности): у каждой — кнопка «Убрать N», внизу — «Добавить» до лимита. */
function DraftRows<L extends RowList>({
  name,
  legend,
  intro,
  item,
  rows,
  max,
  onAdd,
  onRemove,
  children,
}: DraftRowsProps<L>) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 font-extrabold">{legend}</legend>
      {intro && <p className="text-sm text-ink-muted">{intro}</p>}
      {rows.map((row, index) => (
        <div key={row.key} className="grid grid-cols-1 gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
          {children((field) => `${name}.${index}.${field}`)}
          <div className="flex items-end">
            <Button variant="secondary" size="sm" icon={Trash2} onClick={() => onRemove(index)}>
              Убрать {item} {index + 1}
            </Button>
          </div>
        </div>
      ))}
      {rows.length < max && (
        <div>
          <Button variant="secondary" size="sm" icon={Plus} onClick={onAdd}>
            Добавить {item}
          </Button>
        </div>
      )}
    </fieldset>
  )
}
