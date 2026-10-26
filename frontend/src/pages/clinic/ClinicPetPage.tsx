import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/errors'
import { clinicPetObservationsQuery, clinicPetQuery } from '../../api/queries'
import { PetCard } from '../../components/pet/PetCard'
import { Badge, Card, EmptyState, LoadError, PageStatus, Spinner, linkClass } from '../../components/ui'
import { formatSlot } from '../../features/appointments/format'
import { PetPhotoUpload } from '../../features/clinic-appointments/PetPhotoUpload'
import { PageHeader } from '../../layouts/PageHeader'
import { formatLongDate, formatWeight } from '../../lib/format'
import {
  appointmentReasonLabel,
  appointmentStatusLabel,
  appointmentStatusTone,
  conditionKindLabel,
  dataSourceLabel,
  levelLabel,
} from '../../lib/labels'

/** Раздел карточки: заголовок и список или строка «пока нет». */
function Section({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-extrabold">{title}</h2>
      {children.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">{children}</ul>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">{empty}</p>
      )}
    </Card>
  )
}

const ownerSource = 'Внесено владельцем'

/**
 * Карточка питомца для клиники (BR-10.2, FR-18): только чтение, если у питомца есть неотменённая запись в эту клинику
 * (Р-54). Данные, вес и особенности клиника вносит в итоге приёма; фото — здесь, после завершённого приёма (Р-58).
 */
export function ClinicPetPage() {
  const petId = Number(useParams().petId)
  const valid = Number.isInteger(petId)
  const card = useQuery({ ...clinicPetQuery(petId), enabled: valid })
  const observations = useQuery({ ...clinicPetObservationsQuery(petId), enabled: valid && Boolean(card.data) })
  const [now] = useState(() => new Date())
  const [status, setStatus] = useState('')

  const back = (
    <Link to="/clinic/appointments" className={linkClass}>
      <ArrowLeft aria-hidden className="mr-1 inline size-4" />
      Все записи
    </Link>
  )

  function content() {
    if (!valid || (card.error instanceof ApiError && card.error.status === 404)) {
      return (
        <EmptyState
          title="Карточка недоступна"
          description="Карточку питомца клиника видит, пока у него есть неотменённая запись к вам."
          action={back}
        />
      )
    }
    if (card.isPending) return <Spinner label="Загружаем карточку питомца" />
    if (!card.data) return <LoadError title="Не удалось загрузить карточку" onRetry={() => void card.refetch()} />
    const { pet, conditions, vaccinations, appointments } = card.data
    return (
      <div className="flex flex-col gap-4">
        <PetCard pet={pet} today={now} />
        {/* Фото — после завершённого приёма в этой клинике (БП §6.4, Р-58). */}
        {appointments.some((item) => item.status === 'completed') && <PetPhotoUpload petId={pet.id} onStatus={setStatus} />}
        <Section title="Особенности здоровья" empty="Особенностей не отмечено.">
          {conditions.map((condition) => (
            <li key={condition.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={condition.kind === 'allergy' ? 'coral' : 'lilac'}>{conditionKindLabel[condition.kind]}</Badge>
                <span className="text-xs text-ink-muted">
                  {condition.source === 'clinic' ? dataSourceLabel.clinic : ownerSource}
                </span>
              </div>
              <p className="mt-1 font-bold break-words">{condition.title}</p>
              {condition.description && (
                <p className="text-sm break-words whitespace-pre-line text-ink-muted">{condition.description}</p>
              )}
            </li>
          ))}
        </Section>
        <Section title="Прививки" empty="Прививок не внесено.">
          {vaccinations.map((vaccination) => (
            <li key={vaccination.id} className="rounded-xl border border-line p-3 text-sm">
              <p className="font-bold break-words">{vaccination.name}</p>
              <p className="text-ink-muted">
                {formatLongDate(vaccination.date)}
                {vaccination.next_date && ` · следующая ${formatLongDate(vaccination.next_date)}`} ·{' '}
                {vaccination.source === 'clinic' ? dataSourceLabel.clinic : ownerSource}
              </p>
            </li>
          ))}
        </Section>
        {observations.isPending ? (
          <Spinner label="Загружаем дневник" />
        ) : (
          <Section title="Дневник владельца" empty={observations.data ? 'Наблюдений нет.' : 'Не удалось загрузить дневник.'}>
            {(observations.data ?? []).map((observation) => (
              <li key={observation.id} className="rounded-xl border border-line p-3 text-sm">
                <p className="font-bold">{formatLongDate(observation.date)}</p>
                <p className="break-words text-ink-muted">
                  {[
                    observation.weight !== null && `Вес: ${formatWeight(observation.weight)}`,
                    observation.appetite && `Аппетит: ${levelLabel[observation.appetite].toLowerCase()}`,
                    observation.energy && `Энергия: ${levelLabel[observation.energy].toLowerCase()}`,
                    observation.symptoms && `Симптомы: ${observation.symptoms}`,
                    observation.note,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </li>
            ))}
          </Section>
        )}
        <Section title="Приёмы в вашей клинике" empty="Приёмов нет.">
          {appointments.map((appointment) => (
            <li key={appointment.id} className="rounded-xl border border-line p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold first-letter:uppercase">{formatSlot(appointment.slot_start)}</p>
                <Badge tone={appointmentStatusTone[appointment.status]}>{appointmentStatusLabel[appointment.status]}</Badge>
              </div>
              <p className="text-ink-muted">
                {appointment.vet.full_name} · {appointmentReasonLabel[appointment.reason]}
                {appointment.reason_comment && `: ${appointment.reason_comment}`}
              </p>
              {appointment.outcome && <p className="mt-1 break-words">Итог: {appointment.outcome.conclusion}</p>}
            </li>
          ))}
        </Section>
      </div>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Кабинет клиники"
        title={card.data ? card.data.pet.name : 'Карточка питомца'}
        description="Данные, особенности здоровья, прививки, дневник и приёмы в вашей клинике. После приёма можно загрузить фото питомца."
      />
      <div className="mb-4">{back}</div>
      <PageStatus message={status} />
      <div className="max-w-3xl">{content()}</div>
    </>
  )
}
