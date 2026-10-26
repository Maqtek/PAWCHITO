import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { api } from '../../api/client'
import { errorMessage, validationMessages } from '../../api/error-messages'
import { ApiError } from '../../api/errors'
import { healthLimits, outcomeLimits, petLimits } from '../../api/limits'
import { clinicPetQuery, unwrap } from '../../api/queries'
import type { Appointment, CareStatus, ConditionKind, OutcomeCreate, OutcomeResult, Pet, Sex } from '../../api/schema'
import { Button, FormAlert, Modal, SelectField, TextareaField, TextField, type SelectOption } from '../../components/ui'
import { addDays, moscowLocal } from '../../lib/dates'
import { moscowIsoDate } from '../../lib/format'
import { careStatusLabel, careStatusOrder, conditionKindLabel, sexLabel } from '../../lib/labels'
import { formatSlot } from '../appointments/format'
import { parseWeight } from '../health/weight'
import { refetchClinicAppointments } from './clinic-appointment-cache'

const careOptions: SelectOption[] = careStatusOrder.map((value) => ({ value, label: careStatusLabel[value] }))
const kindOptions: SelectOption[] = (['allergy', 'chronic'] as const).map((value) => ({ value, label: conditionKindLabel[value] }))
const sexOptions: SelectOption[] = (['unknown', 'male', 'female'] as const).map((value) => ({ value, label: sexLabel[value] }))
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

interface PrescriptionDraft {
  key: number
  drug: string
  dosage: string
  /** «09:00, 21:00» — через запятую. */
  times: string
  days: string
  start: string
}
interface VaccinationDraft {
  key: number
  name: string
  date: string
  next: string
}
interface ConditionDraft {
  key: number
  kind: string
  title: string
  description: string
}

/** Фокус на первое неверное поле: имя поля — его путь, как у сервера. */
function focusField(form: HTMLFormElement, path: string): void {
  const element = form.elements.namedItem(path)
  if (element instanceof HTMLElement) element.focus()
}

const parseTimes = (text: string) =>
  text
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)

/** Пустое — не передаётся; иначе «как есть», а проверка поля — на клиенте и на сервере (Р-56). */
function toPayload(
  values: { conclusion: string; recommendations: string; careStatus: string },
  prescriptions: PrescriptionDraft[],
  vaccinations: VaccinationDraft[],
  conditions: ConditionDraft[],
  pet: { weight: string; breed: string; birthDate: string; sex: string },
  current: Pet | undefined,
): OutcomeCreate {
  const recommendations = values.recommendations.trim()
  const update: OutcomeCreate['pet_update'] = {}
  const weight = parseWeight(pet.weight)
  if (typeof weight === 'number') update.weight = weight
  // Данные питомца уходят, только если клиника их изменила: уведомление владельцу говорит, что именно (БП §6.4).
  if (current) {
    const breed = pet.breed.trim() === '' ? null : pet.breed.trim()
    if (breed !== current.breed) update.breed = breed
    const birthDate = pet.birthDate === '' ? null : pet.birthDate
    if (birthDate !== current.birth_date) update.birth_date = birthDate
    if (pet.sex !== current.sex) update.sex = pet.sex as Sex
  }
  return {
    conclusion: values.conclusion.trim(),
    recommendations: recommendations === '' ? null : recommendations,
    care_status: values.careStatus as CareStatus,
    ...(prescriptions.length > 0 && {
      prescriptions: prescriptions.map((item) => ({
        drug: item.drug.trim(),
        dosage: item.dosage.trim(),
        times: parseTimes(item.times),
        duration_days: Number(item.days),
        start_date: item.start,
      })),
    }),
    ...(vaccinations.length > 0 && {
      vaccinations: vaccinations.map((item) => ({ name: item.name.trim(), date: item.date, next_date: item.next || null })),
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
  const key = () => nextKey.current++

  const [values, setValues] = useState({ conclusion: '', recommendations: '', careStatus: '' })
  const [prescriptions, setPrescriptions] = useState<PrescriptionDraft[]>([])
  const [vaccinations, setVaccinations] = useState<VaccinationDraft[]>([])
  const [conditions, setConditions] = useState<ConditionDraft[]>([])
  // Данные питомца — из карточки: поля заполнены текущими значениями, уходят только изменённые. Храним только правки:
  // поле, которое не трогали, подхватит значение из карточки, даже если она загрузилась после начала ввода.
  const [petEdits, setPetEdits] = useState<Partial<Record<'weight' | 'breed' | 'birthDate' | 'sex', string>>>({})
  const petValues = {
    weight: petEdits.weight ?? '',
    breed: petEdits.breed ?? card?.pet.breed ?? '',
    birthDate: petEdits.birthDate ?? card?.pet.birth_date ?? '',
    sex: petEdits.sex ?? card?.pet.sex ?? 'unknown',
  }
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  /** Ошибки по путям, как у сервера: «prescriptions.0.times» (Р-56). */
  function validate(): Record<string, string> {
    const found: Record<string, string> = {}
    if (!values.conclusion.trim()) found.conclusion = 'Напишите заключение'
    if (!values.careStatus) found.care_status = 'Выберите статус ухода'
    prescriptions.forEach((item, index) => {
      const at = (field: string) => `prescriptions.${index}.${field}`
      if (!item.drug.trim()) found[at('drug')] = validationMessages.required
      if (!item.dosage.trim()) found[at('dosage')] = validationMessages.required
      const times = parseTimes(item.times)
      if (times.length === 0 || times.length > outcomeLimits.timesMax || !times.every((time) => TIME.test(time))) {
        found[at('times')] = `Время ЧЧ:ММ через запятую, от 1 до ${outcomeLimits.timesMax}`
      } else if (new Set(times).size !== times.length) {
        found[at('times')] = 'Время приёма не должно повторяться'
      }
      const days = Number(item.days)
      if (!Number.isInteger(days) || days < 1 || days > outcomeLimits.durationMax) {
        found[at('duration_days')] = `От 1 до ${outcomeLimits.durationMax} дней`
      }
      if (!item.start || item.start < day || item.start > addDays(day, outcomeLimits.startDaysMax)) {
        found[at('start_date')] = 'От дня приёма до 30 дней после'
      }
    })
    vaccinations.forEach((item, index) => {
      const at = (field: string) => `vaccinations.${index}.${field}`
      if (!item.name.trim()) found[at('name')] = validationMessages.required
      if (!item.date || item.date < day || item.date > today) found[at('date')] = 'От дня приёма до сегодня'
      else if (item.next && item.next <= item.date) found[at('next_date')] = validationMessages.nextDateAfter
    })
    conditions.forEach((item, index) => {
      if (!item.kind) found[`conditions.${index}.kind`] = validationMessages.conditionKind
      if (!item.title.trim()) found[`conditions.${index}.title`] = validationMessages.required
    })
    if (petValues.weight.trim() !== '' && parseWeight(petValues.weight) === undefined) {
      found['pet_update.weight'] = validationMessages.weight
    }
    if (petValues.birthDate && petValues.birthDate > today) found['pet_update.birth_date'] = validationMessages.birthDateFuture
    return found
  }

  // После первой отправки ошибки пересчитываются при вводе — как в useForm.
  const shown = submitted ? { ...errors, ...validate() } : errors

  /** Правка поля убирает его серверную ошибку. */
  function touched(path: string) {
    setErrors((current) => {
      if (!(path in current)) return current
      const next = { ...current }
      delete next[path]
      return next
    })
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
          body: toPayload(values, prescriptions, vaccinations, conditions, petValues, card?.pet),
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

  /** Строки после убранной сдвигаются, и серверные ошибки по индексам указали бы не туда — сбрасываем их. */
  function removeRow(remove: () => void) {
    remove()
    setErrors({})
  }

  function cancel() {
    if (!submitting) onCancel()
  }

  const field = (path: string) => ({ name: path, error: shown[path] })

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      <p className="text-sm text-ink-muted">
        <span className="font-bold text-ink">{appointment.pet.name}</span>, {formatSlot(appointment.slot_start)},{' '}
        {appointment.vet.full_name}. После сохранения итог не меняется.
      </p>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 font-extrabold">Заключение и статус ухода</legend>
        <TextareaField
          label="Заключение"
          rows={3}
          maxLength={outcomeLimits.textMax}
          value={values.conclusion}
          onChange={(event) => {
            setValues({ ...values, conclusion: event.target.value })
            touched('conclusion')
          }}
          {...field('conclusion')}
        />
        <TextareaField
          label="Рекомендации"
          hint="Необязательно"
          rows={2}
          maxLength={outcomeLimits.textMax}
          value={values.recommendations}
          onChange={(event) => {
            setValues({ ...values, recommendations: event.target.value })
            touched('recommendations')
          }}
          {...field('recommendations')}
        />
        <SelectField
          label="Статус ухода"
          hint="Владелец увидит его на главной (БП §6.3)"
          options={careOptions}
          placeholder="Выберите статус"
          value={values.careStatus}
          onChange={(event) => {
            setValues({ ...values, careStatus: event.target.value })
            touched('care_status')
          }}
          {...field('care_status')}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-extrabold">Рецепты</legend>
        <p className="text-sm text-ink-muted">По каждому рецепту владелец получит дела курса на каждый день и время.</p>
        {prescriptions.map((item, index) => {
          const at = (path: string) => `prescriptions.${index}.${path}`
          const change = (patch: Partial<PrescriptionDraft>, path: string) => {
            setPrescriptions(prescriptions.map((draft) => (draft.key === item.key ? { ...draft, ...patch } : draft)))
            touched(at(path))
          }
          return (
            <div key={item.key} className="grid grid-cols-1 gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
              <TextField
                label="Препарат"
                maxLength={outcomeLimits.drugMax}
                value={item.drug}
                onChange={(event) => change({ drug: event.target.value }, 'drug')}
                {...field(at('drug'))}
              />
              <TextField
                label="Дозировка"
                maxLength={outcomeLimits.dosageMax}
                value={item.dosage}
                onChange={(event) => change({ dosage: event.target.value }, 'dosage')}
                {...field(at('dosage'))}
              />
              <TextField
                label="Время приёма"
                hint="Через запятую: 09:00, 21:00"
                value={item.times}
                onChange={(event) => change({ times: event.target.value }, 'times')}
                {...field(at('times'))}
              />
              <TextField
                label="Дней"
                inputMode="numeric"
                value={item.days}
                onChange={(event) => change({ days: event.target.value }, 'duration_days')}
                {...field(at('duration_days'))}
              />
              <TextField
                label="Начало"
                type="date"
                min={day}
                max={addDays(day, outcomeLimits.startDaysMax)}
                value={item.start}
                onChange={(event) => change({ start: event.target.value }, 'start_date')}
                {...field(at('start_date'))}
              />
              <div className="flex items-end">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Trash2}
                  onClick={() => removeRow(() => setPrescriptions(prescriptions.filter((draft) => draft.key !== item.key)))}
                >
                  Убрать рецепт {index + 1}
                </Button>
              </div>
            </div>
          )
        })}
        {prescriptions.length < outcomeLimits.prescriptionsMax && (
          <div>
            <Button
              variant="secondary"
              size="sm"
              icon={Plus}
              onClick={() =>
                setPrescriptions([...prescriptions, { key: key(), drug: '', dosage: '', times: '', days: '7', start: day }])
              }
            >
              Добавить рецепт
            </Button>
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-extrabold">Прививки</legend>
        {vaccinations.map((item, index) => {
          const at = (path: string) => `vaccinations.${index}.${path}`
          const change = (patch: Partial<VaccinationDraft>, path: string) => {
            setVaccinations(vaccinations.map((draft) => (draft.key === item.key ? { ...draft, ...patch } : draft)))
            touched(at(path))
          }
          return (
            <div key={item.key} className="grid grid-cols-1 gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
              <TextField
                label="Название прививки"
                maxLength={healthLimits.vaccineNameMax}
                value={item.name}
                onChange={(event) => change({ name: event.target.value }, 'name')}
                {...field(at('name'))}
              />
              <TextField
                label="Дата прививки"
                type="date"
                min={day}
                max={today}
                value={item.date}
                onChange={(event) => change({ date: event.target.value }, 'date')}
                {...field(at('date'))}
              />
              <TextField
                label="Следующая прививка"
                hint="Необязательно"
                type="date"
                value={item.next}
                onChange={(event) => change({ next: event.target.value }, 'next_date')}
                {...field(at('next_date'))}
              />
              <div className="flex items-end">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Trash2}
                  onClick={() => removeRow(() => setVaccinations(vaccinations.filter((draft) => draft.key !== item.key)))}
                >
                  Убрать прививку {index + 1}
                </Button>
              </div>
            </div>
          )
        })}
        {vaccinations.length < outcomeLimits.vaccinationsMax && (
          <div>
            <Button
              variant="secondary"
              size="sm"
              icon={Plus}
              onClick={() => setVaccinations([...vaccinations, { key: key(), name: '', date: day, next: '' }])}
            >
              Добавить прививку
            </Button>
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-extrabold">Особенности здоровья</legend>
        {conditions.map((item, index) => {
          const at = (path: string) => `conditions.${index}.${path}`
          const change = (patch: Partial<ConditionDraft>, path: string) => {
            setConditions(conditions.map((draft) => (draft.key === item.key ? { ...draft, ...patch } : draft)))
            touched(at(path))
          }
          return (
            <div key={item.key} className="grid grid-cols-1 gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
              <SelectField
                label="Тип"
                options={kindOptions}
                placeholder="Выберите тип"
                value={item.kind}
                onChange={(event) => change({ kind: event.target.value }, 'kind')}
                {...field(at('kind'))}
              />
              <TextField
                label="Название особенности"
                maxLength={healthLimits.conditionTitleMax}
                value={item.title}
                onChange={(event) => change({ title: event.target.value }, 'title')}
                {...field(at('title'))}
              />
              <TextareaField
                label="Комментарий"
                hint="Необязательно"
                rows={2}
                maxLength={healthLimits.conditionDescriptionMax}
                value={item.description}
                onChange={(event) => change({ description: event.target.value }, 'description')}
                {...field(at('description'))}
              />
              <div className="flex items-end">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Trash2}
                  onClick={() => removeRow(() => setConditions(conditions.filter((draft) => draft.key !== item.key)))}
                >
                  Убрать особенность {index + 1}
                </Button>
              </div>
            </div>
          )
        })}
        {conditions.length < outcomeLimits.conditionsMax && (
          <div>
            <Button
              variant="secondary"
              size="sm"
              icon={Plus}
              onClick={() => setConditions([...conditions, { key: key(), kind: '', title: '', description: '' }])}
            >
              Добавить особенность
            </Button>
          </div>
        )}
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-extrabold">Данные питомца</legend>
        <TextField
          label="Вес"
          hint="В килограммах, например 4,2 — запишется в дневник"
          inputMode="decimal"
          value={petValues.weight}
          onChange={(event) => {
            setPetEdits({ ...petEdits, weight: event.target.value })
            touched('pet_update.weight')
          }}
          {...field('pet_update.weight')}
        />
        <TextField
          label="Порода"
          maxLength={petLimits.breedMax}
          value={petValues.breed}
          onChange={(event) => {
            setPetEdits({ ...petEdits, breed: event.target.value })
            touched('pet_update.breed')
          }}
          {...field('pet_update.breed')}
        />
        <TextField
          label="Дата рождения"
          type="date"
          min={petLimits.birthDateMin}
          max={today}
          value={petValues.birthDate}
          onChange={(event) => {
            setPetEdits({ ...petEdits, birthDate: event.target.value })
            touched('pet_update.birth_date')
          }}
          {...field('pet_update.birth_date')}
        />
        <SelectField
          label="Пол"
          options={sexOptions}
          value={petValues.sex}
          onChange={(event) => {
            setPetEdits({ ...petEdits, sex: event.target.value })
            touched('pet_update.sex')
          }}
          {...field('pet_update.sex')}
        />
      </fieldset>

      <FormAlert message={formError} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" aria-disabled={submitting} onClick={cancel}>
          Отмена
        </Button>
        {/* Не disabled: с выключенной кнопки фокус уходит на body. Повторную отправку отсекает submitting. */}
        <Button type="submit" aria-disabled={submitting}>
          {submitting ? 'Сохраняем…' : 'Сохранить итог'}
        </Button>
      </div>
    </form>
  )
}
