import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { api } from '../../api/client'
import { validationMessages } from '../../api/error-messages'
import { ApiError } from '../../api/errors'
import { appointmentLimits } from '../../api/limits'
import { bookingClinicsQuery, bookingVetsQuery, slotsQuery, unwrap } from '../../api/queries'
import type { Appointment, AppointmentReason, Clinic, Pet, Slot, Vet } from '../../api/schema'
import {
  Button,
  EmptyState,
  FormAlert,
  LoadError,
  SelectField,
  Spinner,
  TextareaField,
  TextField,
  type SelectOption,
} from '../../components/ui'
import { cn } from '../../lib/cn'
import { addDays, isoWeekday } from '../../lib/dates'
import { formatTime, moscowIsoDate } from '../../lib/format'
import { appointmentReasonLabel } from '../../lib/labels'
import { useForm } from '../../lib/use-form'
import { formatSchedule } from '../admin/clinic-format'
import { refetchAppointments, storeAppointment } from './appointment-cache'
import { formatSlot } from './format'

type Step = 'clinic' | 'vet' | 'time' | 'details'

const STEPS: { id: Step; title: string }[] = [
  { id: 'clinic', title: 'Клиника' },
  { id: 'vet', title: 'Врач' },
  { id: 'time', title: 'Время' },
  { id: 'details', title: 'Причина и подтверждение' },
]

const reasonOptions: SelectOption[] = (['checkup', 'vaccination', 'illness', 'follow_up', 'other'] as const).map((value) => ({
  value,
  label: appointmentReasonLabel[value],
}))

/** Первый рабочий день клиники в окне записи (Р-49) — с него начинается выбор времени. */
function firstWorkingDay(clinic: Clinic, today: string): string {
  for (let offset = 0; offset <= appointmentLimits.daysAhead; offset += 1) {
    const date = addDays(today, offset)
    if (clinic.work_days.includes(isoWeekday(date))) return date
  }
  return today
}

interface BookingWizardProps {
  pets: Pet[]
  /** Питомец из переключателя — выбран заранее. */
  selectedPetId: number
  onBooked: (appointment: Appointment) => void
}

/** Мастер записи (BR-04.1–04.6): клиника → врач → время → причина и подтверждение. */
export function BookingWizard({ pets, selectedPetId, onBooked }: BookingWizardProps) {
  const queryClient = useQueryClient()
  const [today] = useState(() => moscowIsoDate(new Date()))
  const [step, setStep] = useState<Step>('clinic')
  const [clinic, setClinic] = useState<Clinic>()
  const [vet, setVet] = useState<Vet>()
  const [date, setDate] = useState(today)
  const [slot, setSlot] = useState<Slot>()
  // Причина возврата на шаг времени: слот заняли, пока владелец заполнял причину.
  const [timeNotice, setTimeNotice] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)

  // Фокус — на заголовок нового шага: кнопка, которой перешли, пропала вместе со старым шагом.
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    headingRef.current?.focus()
  }, [step])

  function go(next: Step) {
    moved.current = true
    setStep(next)
  }

  const index = STEPS.findIndex((item) => item.id === step)

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Шаги записи">
        {STEPS.map((item, position) => (
          <li
            key={item.id}
            aria-current={item.id === step ? 'step' : undefined}
            className={cn(position === index ? 'font-extrabold text-ink' : 'text-ink-muted')}
          >
            {position + 1}. {item.title}
          </li>
        ))}
      </ol>
      <h2 ref={headingRef} tabIndex={-1} className="text-lg font-extrabold outline-none">
        Шаг {index + 1} из {STEPS.length}. {STEPS[index].title}
      </h2>
      {step === 'clinic' && (
        <ClinicStep
          onPick={(picked) => {
            setClinic(picked)
            setVet(undefined)
            setSlot(undefined)
            setDate(firstWorkingDay(picked, today))
            go('vet')
          }}
        />
      )}
      {step === 'vet' && clinic && (
        <VetStep
          clinic={clinic}
          onBack={() => go('clinic')}
          onPick={(picked) => {
            setVet(picked)
            setSlot(undefined)
            setTimeNotice('')
            go('time')
          }}
        />
      )}
      {step === 'time' && clinic && vet && (
        <TimeStep
          clinic={clinic}
          vet={vet}
          today={today}
          date={date}
          notice={timeNotice}
          onDate={(next) => {
            setDate(next)
            setTimeNotice('')
          }}
          onBack={() => go('vet')}
          onPick={(picked) => {
            setSlot(picked)
            go('details')
          }}
        />
      )}
      {step === 'details' && clinic && vet && slot && (
        <DetailsStep
          clinic={clinic}
          vet={vet}
          slot={slot}
          pets={pets}
          selectedPetId={selectedPetId}
          onBack={() => go('time')}
          onConflict={() => {
            setSlot(undefined)
            setTimeNotice(validationMessages.slotTaken)
            refetchAppointments(queryClient)
            go('time')
          }}
          onBooked={onBooked}
        />
      )}
    </div>
  )
}

/** Карточка выбора: клиника или врач с кнопкой «Выбрать». */
function Choice({ title, children, onPick }: { title: string; children: ReactNode; onPick: () => void }) {
  const titleId = useId()
  return (
    <article aria-labelledby={titleId} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="min-w-0">
        <h3 id={titleId} className="font-extrabold break-words">
          {title}
        </h3>
        <div className="mt-1 text-sm text-ink-muted">{children}</div>
      </div>
      <Button size="sm" onClick={onPick}>
        Выбрать<span className="sr-only">: {title}</span>
      </Button>
    </article>
  )
}

function BackButton({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <div>
      <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={onBack}>
        {children}
      </Button>
    </div>
  )
}

function ClinicStep({ onPick }: { onPick: (clinic: Clinic) => void }) {
  const { data: clinics, isPending, refetch } = useQuery(bookingClinicsQuery)
  if (isPending) return <Spinner label="Загружаем клиники" />
  if (!clinics) return <LoadError title="Не удалось загрузить клиники" onRetry={() => void refetch()} />
  if (clinics.length === 0) return <EmptyState title="Сейчас нет клиник для записи" description="Загляните позже." />
  return (
    <ul className="flex flex-col gap-3">
      {clinics.map((clinic) => (
        <li key={clinic.id}>
          <Choice title={clinic.name} onPick={() => onPick(clinic)}>
            <p className="break-words">{clinic.address}</p>
            <p>{formatSchedule(clinic)}</p>
          </Choice>
        </li>
      ))}
    </ul>
  )
}

function VetStep({ clinic, onBack, onPick }: { clinic: Clinic; onBack: () => void; onPick: (vet: Vet) => void }) {
  const { data: vets, isPending, error, refetch } = useQuery(bookingVetsQuery(clinic.id))
  const back = <BackButton onBack={onBack}>Другая клиника</BackButton>

  function content() {
    if (isPending) return <Spinner label="Загружаем врачей" />
    // Клинику скрыли, пока владелец выбирал (Р-49).
    if (error instanceof ApiError && error.status === 404) {
      return <EmptyState title="Клиника больше не принимает записи" description="Выберите другую клинику." />
    }
    if (!vets) return <LoadError title="Не удалось загрузить врачей" onRetry={() => void refetch()} />
    if (vets.length === 0) {
      return <EmptyState title="Сейчас нет врачей для записи" description="Все врачи клиники в отпуске. Выберите другую клинику." />
    }
    return (
      <ul className="flex flex-col gap-3">
        {vets.map((vet) => (
          <li key={vet.id}>
            <Choice title={vet.full_name} onPick={() => onPick(vet)}>
              {vet.specialization ?? 'Специализация не указана'}
            </Choice>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <>
      <p className="text-sm text-ink-muted">
        {clinic.name} · {formatSchedule(clinic)}
      </p>
      {content()}
      {back}
    </>
  )
}

interface TimeStepProps {
  clinic: Clinic
  vet: Vet
  today: string
  date: string
  notice: string
  onDate: (date: string) => void
  onBack: () => void
  onPick: (slot: Slot) => void
}

function TimeStep({ clinic, vet, today, date, notice, onDate, onBack, onPick }: TimeStepProps) {
  const last = addDays(today, appointmentLimits.daysAhead)
  const inWindow = date >= today && date <= last
  const workingDay = inWindow && clinic.work_days.includes(isoWeekday(date))
  const { data: slots, isPending, error, refetch } = useQuery({
    ...slotsQuery(clinic.id, vet.id, date),
    enabled: workingDay,
  })

  function content() {
    if (!inWindow) return <p className="text-sm">Выберите дату с сегодняшнего дня и не дальше 30 дней.</p>
    if (!workingDay) return <p className="text-sm">Клиника не работает в этот день — выберите другую дату.</p>
    if (isPending) return <Spinner label="Загружаем свободное время" />
    // Врач ушёл в отпуск или в архив, пока владелец выбирал.
    if (error instanceof ApiError && error.status === 404) {
      return <p className="text-sm">Врач больше не принимает записи — выберите другого врача.</p>
    }
    if (!slots) return <LoadError title="Не удалось загрузить свободное время" onRetry={() => void refetch()} />
    if (slots.length === 0) return <p className="text-sm">На эту дату свободного времени нет — выберите другую дату.</p>
    return (
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Свободное время">
        {slots.map((slot) => (
          <li key={slot.slot_start}>
            <Button variant="secondary" size="sm" className="w-full" onClick={() => onPick(slot)}>
              {formatTime(slot.slot_start)}
            </Button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <>
      <p className="text-sm text-ink-muted">
        {clinic.name} · {vet.full_name}
      </p>
      <FormAlert message={notice || null} />
      <div className="max-w-xs">
        <TextField
          label="Дата"
          type="date"
          min={today}
          max={last}
          value={date}
          hint={`Рабочие дни и часы: ${formatSchedule(clinic)}`}
          onChange={(event) => onDate(event.target.value)}
        />
      </div>
      {content()}
      <BackButton onBack={onBack}>Другой врач</BackButton>
    </>
  )
}

interface DetailsStepProps {
  clinic: Clinic
  vet: Vet
  slot: Slot
  pets: Pet[]
  selectedPetId: number
  onBack: () => void
  /** Слот заняли, пока владелец заполнял форму (409). */
  onConflict: () => void
  onBooked: (appointment: Appointment) => void
}

function DetailsStep({ clinic, vet, slot, pets, selectedPetId, onBack, onConflict, onBooked }: DetailsStepProps) {
  const queryClient = useQueryClient()
  const petOptions: SelectOption[] = pets.map((pet) => ({ value: String(pet.id), label: pet.name }))
  const form = useForm({
    initial: { pet_id: String(selectedPetId), reason: '', reason_comment: '' },
    validate: (values) => ({
      pet_id: values.pet_id ? undefined : validationMessages.pet,
      reason: values.reason ? undefined : validationMessages.reason,
    }),
    context: 'booking',
    // Ссылки в теле (питомец, врач, время) — не поля формы: текст сервера показываем над кнопкой (Р-50).
    onError: (error) => {
      if (!(error instanceof ApiError) || error.status !== 422) return undefined
      const reference = error.fieldErrors.vet_id ?? error.fieldErrors.slot_start ?? error.fieldErrors.pet_id
      return reference ? { form: `${reference}. Вернитесь на шаг назад и выберите заново.` } : undefined
    },
    onSubmit: async (values) => {
      const comment = values.reason_comment.trim()
      try {
        const created = await unwrap(
          api.POST('/appointments', {
            body: {
              pet_id: Number(values.pet_id),
              vet_id: vet.id,
              slot_start: slot.slot_start,
              reason: values.reason as AppointmentReason,
              reason_comment: comment === '' ? null : comment,
            },
          }),
        )
        storeAppointment(queryClient, created)
        onBooked(created)
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          onConflict()
          return
        }
        refetchAppointments(queryClient)
        throw error
      }
    },
  })

  const summary: [string, string][] = [
    ['Клиника', `${clinic.name}, ${clinic.address}`],
    ['Врач', vet.full_name],
    ['Время', formatSlot(slot.slot_start)],
  ]

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-card border border-line bg-surface-muted p-4 sm:grid-cols-[6rem_minmax(0,1fr)]">
        {summary.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-sm text-ink-muted">{label}</dt>
            <dd className="text-sm font-bold break-words first-letter:uppercase">{value}</dd>
          </div>
        ))}
      </dl>
      {pets.length > 1 && <SelectField label="Питомец" options={petOptions} {...form.field('pet_id')} />}
      <SelectField label="Причина обращения" options={reasonOptions} placeholder="Выберите причину" {...form.field('reason')} />
      <TextareaField
        label="Комментарий для клиники"
        hint="Необязательно: что беспокоит, какая прививка нужна"
        rows={3}
        maxLength={appointmentLimits.reasonCommentMax}
        {...form.field('reason_comment')}
      />
      <FormAlert message={form.formError} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="secondary" icon={ArrowLeft} aria-disabled={form.submitting} onClick={() => !form.submitting && onBack()}>
          Другое время
        </Button>
        {/* Не disabled: с выключенной кнопки фокус уходит на body. Повторную отправку отсекает useForm. */}
        <Button type="submit" aria-disabled={form.submitting}>
          {form.submitting ? 'Отправляем…' : 'Записаться'}
        </Button>
      </div>
    </form>
  )
}
