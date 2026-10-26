import { useQuery } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { observationsQuery } from '../../api/queries'
import type { Observation } from '../../api/schema'
import { Badge, Button } from '../../components/ui'
import { formatLongDate, formatWeight } from '../../lib/format'
import { dataSourceLabel, levelLabel } from '../../lib/labels'
import { HealthSection } from './HealthSection'
import { ObservationFormModal } from './ObservationFormModal'

interface Dialog {
  observation?: Observation
  /** Закрытое окно хранит свои данные до следующего открытия — заголовок не меняется, пока окно закрывается. */
  open: boolean
}

interface DiarySectionProps {
  petId: number
  onStatus: (message: string) => void
}

/** Дневник: наблюдения не удаляются, свои владелец исправляет правкой (Р-43). */
export function DiarySection({ petId, onStatus }: DiarySectionProps) {
  const list = useQuery(observationsQuery(petId))
  const [dialog, setDialog] = useState<Dialog>({ open: false })
  const listRef = useRef<HTMLDivElement>(null)
  // Данные записи в окне — из свежего списка; пропала из списка — последние известные.
  const dialogObservation =
    dialog.observation && (list.data?.find((item) => item.id === dialog.observation?.id) ?? dialog.observation)

  function openDialog(observation?: Observation) {
    // Старое сообщение не висит над открытым окном, а тот же текст после следующего действия озвучится заново.
    onStatus('')
    setDialog({ observation, open: true })
  }

  return (
    <>
      <HealthSection
        title="Дневник"
        addLabel="Новое наблюдение"
        onAdd={() => openDialog()}
        listRef={listRef}
        list={list}
        loadingLabel="Загружаем дневник"
        errorTitle="Не удалось загрузить дневник"
        empty={{
          title: 'Наблюдений пока нет',
          description: 'Записывайте вес, аппетит, энергию и симптомы — врачу будет проще понять, что изменилось.',
        }}
      >
        {(observations) => (
          <ul className="flex flex-col gap-3">
            {observations.map((observation) => (
              <li key={observation.id}>
                <ObservationItem observation={observation} onEdit={() => openDialog(observation)} />
              </li>
            ))}
          </ul>
        )}
      </HealthSection>
      <ObservationFormModal
        open={dialog.open}
        petId={petId}
        observation={dialogObservation}
        onClose={() => setDialog((current) => ({ ...current, open: false }))}
        onSaved={() => {
          onStatus(dialog.observation ? 'Наблюдение сохранено.' : 'Наблюдение добавлено.')
          setDialog((current) => ({ ...current, open: false }))
        }}
      />
    </>
  )
}

interface ObservationItemProps {
  observation: Observation
  onEdit: () => void
}

function ObservationItem({ observation, onEdit }: ObservationItemProps) {
  const dateId = useId()
  const fromClinic = observation.source === 'clinic'
  const date = formatLongDate(observation.date)
  const facts = [
    observation.weight !== null && { label: 'Вес', value: formatWeight(observation.weight) },
    observation.appetite && { label: 'Аппетит', value: levelLabel[observation.appetite] },
    observation.energy && { label: 'Энергия', value: levelLabel[observation.energy] },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact))

  return (
    <article aria-labelledby={dateId} className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={dateId} className="font-extrabold">
          {date}
        </h3>
        {fromClinic && <Badge tone="sky">{dataSourceLabel.clinic}</Badge>}
      </div>
      {facts.length > 0 && (
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {facts.map((fact) => (
            <div key={fact.label} className="flex gap-1.5">
              <dt className="text-ink-muted">{fact.label}:</dt>
              <dd className="font-bold">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {observation.symptoms && (
        <p className="mt-2 text-sm break-words whitespace-pre-line">
          <span className="text-ink-muted">Симптомы: </span>
          {observation.symptoms}
        </p>
      )}
      {observation.note && <p className="mt-2 text-sm break-words whitespace-pre-line text-ink-muted">{observation.note}</p>}
      {/* Наблюдение клиники (вес с приёма) владелец только читает (БП §3). */}
      {!fromClinic && (
        <div className="mt-3">
          <Button variant="secondary" size="sm" icon={Pencil} onClick={onEdit}>
            Изменить<span className="sr-only">, наблюдение за {date}</span>
          </Button>
        </div>
      )}
    </article>
  )
}
