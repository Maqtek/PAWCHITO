import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { api } from '../../api/client'
import { queryKeys, unwrap, vaccinationsQuery } from '../../api/queries'
import type { Vaccination } from '../../api/schema'
import { ConfirmActionModal } from '../../components/ConfirmActionModal'
import { Badge, Button } from '../../components/ui'
import { formatLongDate, moscowIsoDate } from '../../lib/format'
import { dataSourceLabel } from '../../lib/labels'
import { saveRecord } from './health-cache'
import { HealthSection } from './HealthSection'
import { useRecordDialog } from './use-record-dialog'
import { VaccinationFormModal } from './VaccinationFormModal'

interface VaccinationsSectionProps {
  petId: number
  onStatus: (message: string) => void
}

export function VaccinationsSection({ petId, onStatus }: VaccinationsSectionProps) {
  const queryClient = useQueryClient()
  const list = useQuery(vaccinationsQuery(petId))
  // Прививка удалена вместе с кнопкой, открывшей окно, — фокус уходит на список.
  const dialog = useRecordDialog<'add' | 'edit' | 'delete', Vaccination>(list.data, onStatus)
  const [today] = useState(() => moscowIsoDate(new Date()))

  async function remove() {
    const vaccination = dialog.record
    if (!vaccination) return
    await saveRecord(
      queryClient,
      queryKeys.vaccinations(petId),
      unwrap(
        api.DELETE('/pets/{pet_id}/vaccinations/{id}', {
          params: { path: { pet_id: petId, id: vaccination.id } },
        }),
      ).then(() => vaccination),
      { remove: true },
    )
    onStatus('Прививка удалена.')
    dialog.close({ gone: true })
  }

  return (
    <>
      <HealthSection
        title="Прививки"
        addLabel="Внести из ветпаспорта"
        onAdd={() => dialog.open('add')}
        listRef={dialog.listRef}
        list={list}
        loadingLabel="Загружаем прививки"
        errorTitle="Не удалось загрузить прививки"
        empty={{
          title: 'Прививок пока нет',
          description: 'Внесите прививки из бумажного ветпаспорта. Прививки с приёма добавит клиника.',
        }}
      >
        {(vaccinations) => (
          <ul className="flex flex-col gap-3">
            {vaccinations.map((vaccination) => (
              <li key={vaccination.id}>
                <VaccinationItem
                  vaccination={vaccination}
                  today={today}
                  onEdit={() => dialog.open('edit', vaccination)}
                  onDelete={() => dialog.open('delete', vaccination)}
                />
              </li>
            ))}
          </ul>
        )}
      </HealthSection>
      <VaccinationFormModal
        open={dialog.isOpen && (dialog.kind === 'add' || dialog.kind === 'edit')}
        petId={petId}
        vaccination={dialog.kind === 'edit' ? dialog.record : undefined}
        onClose={() => dialog.close()}
        onSaved={() => {
          onStatus(dialog.kind === 'add' ? 'Прививка добавлена.' : 'Прививка сохранена.')
          dialog.close()
        }}
      />
      <ConfirmActionModal
        open={dialog.isOpen && dialog.kind === 'delete'}
        title="Удалить прививку"
        submitLabel="Удалить"
        submittingLabel="Удаляем…"
        context="health"
        onConfirm={remove}
        onClose={() => dialog.close()}
      >
        <p className="text-sm">
          Прививка <span className="font-bold break-words">{dialog.record?.name}</span>
          {dialog.record && ` от ${formatLongDate(dialog.record.date)}`} будет удалена, а следующая пропадёт из
          календаря. Вернуть её нельзя — только внести заново.
        </p>
      </ConfirmActionModal>
    </>
  )
}

interface VaccinationItemProps {
  vaccination: Vaccination
  /** Сегодня по Москве, «YYYY-MM-DD»: с ним сравнивается дата следующей прививки. */
  today: string
  onEdit: () => void
  onDelete: () => void
}

function VaccinationItem({ vaccination, today, onEdit, onDelete }: VaccinationItemProps) {
  const nameId = useId()
  const fromClinic = vaccination.source === 'clinic'
  const overdue = vaccination.next_date !== null && vaccination.next_date < today
  // Подпись для скринридера — с названием: в списке много одинаковых «Изменить».
  const forRecord = <span className="sr-only">, {vaccination.name}</span>

  return (
    <article aria-labelledby={nameId} className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={nameId} className="font-extrabold break-words">
          {vaccination.name}
        </h3>
        <div className="flex flex-wrap gap-2">
          {overdue && <Badge tone="coral">Просрочена</Badge>}
          {fromClinic && <Badge tone="sky">{dataSourceLabel.clinic}</Badge>}
        </div>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        Сделана {formatLongDate(vaccination.date)}
        {vaccination.next_date && (
          <>
            {' · '}
            {overdue ? 'следующая была нужна' : 'следующая'} {formatLongDate(vaccination.next_date)}
          </>
        )}
      </p>
      {/* Прививку с приёма владелец только видит (БП §3). */}
      {fromClinic ? (
        <p className="mt-3 text-xs text-ink-muted">Изменить запись может только клиника.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={Pencil} onClick={onEdit}>
            Изменить{forRecord}
          </Button>
          <Button variant="secondary" size="sm" icon={Trash2} onClick={onDelete}>
            Удалить{forRecord}
          </Button>
        </div>
      )}
    </article>
  )
}
