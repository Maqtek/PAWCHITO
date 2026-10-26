import { useQuery } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { validationMessages } from '../../api/error-messages'
import { clinicAppointmentsQuery, clinicVetsQuery, type ClinicAppointmentFilters } from '../../api/queries'
import type { Appointment, AppointmentStatus } from '../../api/schema'
import { Button, EmptyState, SelectField, Spinner, Tabs, TextField, type SelectOption } from '../../components/ui'
import { ClinicAppointmentCard, type VetAvailability } from '../../features/clinic-appointments/ClinicAppointmentCard'
import { ClinicCancelModal } from '../../features/clinic-appointments/ClinicCancelModal'
import { OutcomeFormModal } from '../../features/clinic-appointments/OutcomeFormModal'
import { PageHeader } from '../../layouts/PageHeader'
import { addDays } from '../../lib/dates'
import { moscowIsoDate } from '../../lib/format'
import { appointmentStatusLabel, careStatusLabel } from '../../lib/labels'

type View = 'schedule' | 'awaiting' | 'decision'

const VIEWS: readonly View[] = ['schedule', 'awaiting', 'decision']
const STATUSES: readonly AppointmentStatus[] = ['requested', 'confirmed', 'completed', 'cancelled']

const statusOptions: SelectOption[] = [
  { value: '', label: 'Все статусы' },
  ...STATUSES.map((value) => ({ value, label: appointmentStatusLabel[value] })),
]

interface Dialog {
  kind: 'cancel' | 'outcome'
  appointment?: Appointment
  /** Закрытое окно хранит свои данные до следующего открытия — заголовок не меняется, пока окно закрывается. */
  open: boolean
}

/**
 * Записи клиники (BR-05.1–05.7). Вкладка и фильтры — в адресе: ссылка из уведомления открывает нужный день
 * (`?date_from=…&date_to=…`, Р-55), а «Назад» возвращает прежний фильтр.
 */
export function ClinicAppointmentsPage() {
  const [params, setParams] = useSearchParams()
  const [now] = useState(() => new Date())
  const today = moscowIsoDate(now)
  const viewParam = params.get('view') as View | null
  const view: View = viewParam && VIEWS.includes(viewParam) ? viewParam : 'schedule'
  // По умолчанию — неделя с сегодняшнего дня.
  const dateFrom = params.get('date_from') ?? today
  const dateTo = params.get('date_to') ?? addDays(today, 6)
  const vetId = params.get('vet_id') ?? ''
  const statusParam = params.get('status') ?? ''
  const status = STATUSES.includes(statusParam as AppointmentStatus) ? (statusParam as AppointmentStatus) : undefined
  const rangeInvalid = dateFrom !== '' && dateTo !== '' && dateFrom > dateTo

  const scheduleFilters: ClinicAppointmentFilters = {
    ...(dateFrom && { date_from: dateFrom }),
    ...(dateTo && { date_to: dateTo }),
    ...(vetId && { vet_id: Number(vetId) }),
    ...(status && { status }),
  }
  const schedule = useQuery({ ...clinicAppointmentsQuery(scheduleFilters), enabled: view === 'schedule' && !rangeInvalid })
  // «Ждут итога» и «Требуют решения» — всегда: их числа во вкладках.
  const awaiting = useQuery(clinicAppointmentsQuery({ awaiting_outcome: true }))
  const decision = useQuery(clinicAppointmentsQuery({ requires_decision: true }))
  const vets = useQuery(clinicVetsQuery)

  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState<Dialog>({ kind: 'cancel', open: false })
  const listRef = useRef<HTMLDivElement>(null)
  const focusList = useRef(false)

  // Отменённая запись уходит из вкладки вместе с кнопкой, открывшей окно, — фокус переходит на список.
  useEffect(() => {
    if (!focusList.current) return
    focusList.current = false
    listRef.current?.focus()
  })

  const current = view === 'schedule' ? schedule : view === 'awaiting' ? awaiting : decision
  const vetAvailability = new Map<number, VetAvailability>()
  for (const vet of vets.data ?? []) {
    if (vet.archived_at !== null) vetAvailability.set(vet.id, 'archived')
    else if (vet.on_vacation) vetAvailability.set(vet.id, 'vacation')
  }
  const vetOptions: SelectOption[] = [
    { value: '', label: 'Все врачи' },
    ...(vets.data ?? []).map((vet) => ({
      value: String(vet.id),
      label: vet.archived_at !== null ? `${vet.full_name} (архив)` : vet.full_name,
    })),
  ]
  // Данные записи в окне — из свежего списка; пропала из списка — последние известные.
  const dialogAppointment =
    dialog.appointment && (current.data?.find((item) => item.id === dialog.appointment?.id) ?? dialog.appointment)

  function update(changes: Record<string, string>) {
    setNotice('')
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        for (const [key, value] of Object.entries(changes)) {
          if (value === '') next.delete(key)
          else next.set(key, value)
        }
        return next
      },
      { replace: true },
    )
  }

  function content() {
    if (view === 'schedule' && rangeInvalid) return <p className="text-sm">{validationMessages.dateRange}.</p>
    if (current.isPending) return <Spinner label="Загружаем записи" />
    if (!current.data) {
      return (
        <EmptyState
          title="Не удалось загрузить записи"
          description="Проверьте соединение и попробуйте ещё раз."
          action={<Button onClick={() => void current.refetch()}>Повторить</Button>}
        />
      )
    }
    if (current.data.length === 0) {
      const empty = {
        schedule: { title: 'Записей нет', description: 'На эти даты с такими фильтрами записей нет.' },
        awaiting: { title: 'Итогов не ждёт ни одна запись', description: 'Сюда попадают подтверждённые записи, время которых прошло.' },
        decision: { title: 'Решений не требуется', description: 'Сюда попадают будущие записи врачей в отпуске или в архиве.' },
      }[view]
      return <EmptyState icon={ClipboardList} title={empty.title} description={empty.description} />
    }
    return (
      <ul className="flex flex-col gap-3">
        {current.data.map((appointment) => (
          <li key={appointment.id}>
            <ClinicAppointmentCard
              appointment={appointment}
              now={now}
              vetUnavailable={view === 'decision' ? vetAvailability.get(appointment.vet.id) : undefined}
              onStatus={setNotice}
              onCancel={() => setDialog({ kind: 'cancel', appointment, open: true })}
              onOutcome={() => setDialog({ kind: 'outcome', appointment, open: true })}
            />
          </li>
        ))}
      </ul>
    )
  }

  const count = (list: typeof awaiting) => (list.data ? ` (${list.data.length})` : '')

  return (
    <>
      <PageHeader eyebrow="Кабинет клиники" title="Записи" description="Заявки, подтверждённые приёмы, итоги и записи, требующие решения." />
      <div className="flex max-w-3xl flex-col gap-4">
        <Tabs
          label="Записи"
          value={view}
          onChange={(next) => update({ view: next === 'schedule' ? '' : next })}
          items={[
            { id: 'schedule', label: 'Расписание' },
            { id: 'awaiting', label: `Ждут итога${count(awaiting)}` },
            { id: 'decision', label: `Требуют решения${count(decision)}` },
          ]}
        />
        {view === 'schedule' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <TextField label="С" type="date" value={dateFrom} onChange={(event) => update({ date_from: event.target.value })} />
            <TextField label="По" type="date" value={dateTo} onChange={(event) => update({ date_to: event.target.value })} />
            <SelectField label="Врач" options={vetOptions} value={vetId} onChange={(event) => update({ vet_id: event.target.value })} />
            <SelectField
              label="Статус"
              options={statusOptions}
              value={status ?? ''}
              onChange={(event) => update({ status: event.target.value })}
            />
          </div>
        )}
        {/* Регион статуса смонтирован в любом состоянии: сообщение в уже существующем регионе скринридер озвучит. */}
        <p role="status" className="text-sm font-semibold text-primary empty:hidden">
          {notice}
        </p>
        {/* tabIndex -1: сюда уходит фокус, когда запись пропала из вкладки вместе со своей кнопкой. */}
        <div ref={listRef} tabIndex={-1} className="outline-none">
          {content()}
        </div>
      </div>
      <ClinicCancelModal
        open={dialog.open && dialog.kind === 'cancel'}
        appointment={dialogAppointment}
        onClose={() => setDialog((currentDialog) => ({ ...currentDialog, open: false }))}
        onDone={(cancelled) => {
          setNotice(`Запись отменена: ${cancelled.pet.name}. Владелец получит уведомление с вашим комментарием.`)
          focusList.current = true
          setDialog((currentDialog) => ({ ...currentDialog, open: false }))
        }}
      />
      <OutcomeFormModal
        open={dialog.open && dialog.kind === 'outcome'}
        appointment={dialogAppointment}
        onClose={() => setDialog((currentDialog) => ({ ...currentDialog, open: false }))}
        onDone={({ appointment, created_reminders: reminders }) => {
          const status = appointment.outcome ? careStatusLabel[appointment.outcome.care_status].toLowerCase() : ''
          setNotice(
            `Итог внесён: ${appointment.pet.name} — ${status}.` +
              (reminders > 0 ? ` Дел курса: ${reminders}.` : '') +
              ' Владелец получит уведомление.',
          )
          // Запись ушла из «Ждут итога» вместе с кнопкой, открывшей окно.
          focusList.current = true
          setDialog((currentDialog) => ({ ...currentDialog, open: false }))
        }}
      />
    </>
  )
}
