import { useQuery } from '@tanstack/react-query'
import { CalendarPlus, ClipboardList, PawPrint } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { petAppointmentsQuery } from '../../api/queries'
import type { Appointment } from '../../api/schema'
import { Button, buttonClass, EmptyState, Spinner } from '../../components/ui'
import { isCancellable } from '../../features/appointments/appointment-cache'
import { AppointmentCard } from '../../features/appointments/AppointmentCard'
import { CancelAppointmentModal } from '../../features/appointments/CancelAppointmentModal'
import { useSelectedPet } from '../../features/pets/useSelectedPet'
import { PageHeader } from '../../layouts/PageHeader'

interface Dialog {
  appointment?: Appointment
  /** Закрытое окно хранит свои данные до следующего открытия — заголовок не меняется, пока окно закрывается. */
  open: boolean
}

const bookLink = (
  <Link to="/appointments/new" className={buttonClass()}>
    <CalendarPlus aria-hidden className="size-4" />
    Записаться к врачу
  </Link>
)

export function AppointmentsPage() {
  const { pet, isPending: petsPending, isError: petsError, refetch: refetchPets } = useSelectedPet()

  function content() {
    if (petsPending) return <Spinner label="Загружаем питомцев" />
    if (!pet && petsError) {
      return (
        <EmptyState
          title="Не удалось загрузить питомцев"
          description="Проверьте соединение и попробуйте ещё раз."
          action={<Button onClick={() => void refetchPets()}>Повторить</Button>}
        />
      )
    }
    if (!pet) {
      return (
        <EmptyState
          icon={PawPrint}
          title="Сначала добавьте питомца"
          description="Запись к врачу делается для конкретного питомца."
          action={
            <Link to="/pets" className={buttonClass()}>
              Добавить питомца
            </Link>
          }
        />
      )
    }
    // key: при смене питомца список и окно начинают с чистого листа.
    return <PetAppointments key={pet.id} petId={pet.id} petName={pet.name} />
  }

  return (
    <>
      <PageHeader
        eyebrow="Ветеринар"
        title="Записи к врачу"
        description={pet ? `Записи питомца ${pet.name}: предстоящие и прошедшие.` : 'Запись в клинику и ваши записи.'}
        actions={pet ? bookLink : undefined}
      />
      {content()}
    </>
  )
}

function PetAppointments({ petId, petName }: { petId: number; petName: string }) {
  const { data: appointments, isPending, refetch } = useQuery(petAppointmentsQuery(petId))
  const location = useLocation()
  // Сообщение мастера записи приходит через state перехода и показывается один раз.
  const [status, setStatus] = useState(() => (location.state as { status?: string } | null)?.status ?? '')
  const [dialog, setDialog] = useState<Dialog>({ open: false })
  const [now] = useState(() => new Date())
  const listRef = useRef<HTMLDivElement>(null)
  const focusList = useRef(false)

  // Отменённая запись уходит в «Прошедшие» вместе с кнопкой, открывшей окно, — фокус переходит на список.
  useEffect(() => {
    if (!focusList.current) return
    focusList.current = false
    listRef.current?.focus()
  })

  const upcoming = (appointments ?? [])
    .filter((item) => isCancellable(item, now))
    .sort((a, b) => new Date(a.slot_start).getTime() - new Date(b.slot_start).getTime())
  const past = (appointments ?? []).filter((item) => !isCancellable(item, now))
  // Данные записи в окне — из свежего списка; пропала из списка — последние известные.
  const dialogAppointment =
    dialog.appointment && (appointments?.find((item) => item.id === dialog.appointment?.id) ?? dialog.appointment)

  function content() {
    if (isPending) return <Spinner label="Загружаем записи" />
    if (!appointments) {
      return (
        <EmptyState
          title="Не удалось загрузить записи"
          description="Проверьте соединение и попробуйте ещё раз."
          action={<Button onClick={() => void refetch()}>Повторить</Button>}
        />
      )
    }
    if (appointments.length === 0) {
      return (
        <EmptyState
          icon={ClipboardList}
          title="Записей пока нет"
          description={`Запишите питомца ${petName} к врачу — клиника подтвердит запись, а статус появится здесь.`}
          action={bookLink}
        />
      )
    }
    return (
      <div className="flex flex-col gap-6">
        <section aria-labelledby="upcoming-heading">
          <h2 id="upcoming-heading" className="mb-3 text-lg font-extrabold">
            Предстоящие
          </h2>
          {upcoming.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {upcoming.map((appointment) => (
                <li key={appointment.id}>
                  <AppointmentCard
                    appointment={appointment}
                    onCancel={() => {
                      setStatus('')
                      setDialog({ appointment, open: true })
                    }}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">Предстоящих записей нет.</p>
          )}
        </section>
        {past.length > 0 && (
          <section aria-labelledby="past-heading">
            <h2 id="past-heading" className="mb-3 text-lg font-extrabold">
              Прошедшие и отменённые
            </h2>
            <ul className="flex flex-col gap-3">
              {past.map((appointment) => (
                <li key={appointment.id}>
                  <AppointmentCard appointment={appointment} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Регион статуса смонтирован в любом состоянии: сообщение в уже существующем регионе скринридер озвучит. */}
      <p role="status" className="mb-4 text-sm font-semibold text-primary empty:mb-0">
        {status}
      </p>
      {/* tabIndex -1: сюда уходит фокус, когда отменённая запись ушла из предстоящих вместе со своей кнопкой. */}
      <div ref={listRef} tabIndex={-1} className="max-w-2xl outline-none">
        {content()}
      </div>
      <CancelAppointmentModal
        open={dialog.open}
        appointment={dialogAppointment}
        onClose={() => setDialog((current) => ({ ...current, open: false }))}
        onDone={() => {
          setStatus('Запись отменена. Клиника получит уведомление.')
          focusList.current = true
          setDialog((current) => ({ ...current, open: false }))
        }}
      />
    </>
  )
}
