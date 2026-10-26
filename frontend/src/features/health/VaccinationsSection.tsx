import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { api } from '../../api/client'
import { queryKeys, unwrap, vaccinationsQuery } from '../../api/queries'
import type { Vaccination } from '../../api/schema'
import { Badge, Button } from '../../components/ui'
import { formatLongDate, moscowIsoDate } from '../../lib/format'
import { dataSourceLabel } from '../../lib/labels'
import { useFocusAfterRender } from '../../lib/use-focus-after-render'
import { ConfirmActionModal } from './ConfirmActionModal'
import { refetchAfterFailure, storeRecord } from './health-cache'
import { HealthSection } from './HealthSection'
import { VaccinationFormModal } from './VaccinationFormModal'

interface Dialog {
  kind: 'add' | 'edit' | 'delete'
  vaccination?: Vaccination
  /** Закрытое окно хранит свои данные до следующего открытия — заголовок не меняется, пока окно закрывается. */
  open: boolean
}

interface VaccinationsSectionProps {
  petId: number
  onStatus: (message: string) => void
}

export function VaccinationsSection({ petId, onStatus }: VaccinationsSectionProps) {
  const queryClient = useQueryClient()
  const list = useQuery(vaccinationsQuery(petId))
  const [dialog, setDialog] = useState<Dialog>({ kind: 'add', open: false })
  const [today] = useState(() => moscowIsoDate(new Date()))
  // Прививка удалена вместе с кнопкой, открывшей окно, — без этого фокус упадёт на body.
  const [listRef, focusListLater] = useFocusAfterRender<HTMLDivElement>()

  // Данные записи в окне — из свежего списка; пропала из списка — последние известные.
  const dialogVaccination =
    dialog.vaccination && (list.data?.find((item) => item.id === dialog.vaccination?.id) ?? dialog.vaccination)

  function openDialog(kind: Dialog['kind'], vaccination?: Vaccination) {
    // Старое сообщение не висит над открытым окном, а тот же текст после следующего действия озвучится заново.
    onStatus('')
    setDialog({ kind, vaccination, open: true })
  }

  function closeDialog({ gone = false } = {}) {
    if (dialog.vaccination && (gone || !list.data?.some((item) => item.id === dialog.vaccination?.id))) {
      focusListLater()
    }
    setDialog((current) => ({ ...current, open: false }))
  }

  async function remove() {
    if (!dialogVaccination) return
    const queryKey = queryKeys.vaccinations(petId)
    await unwrap(
      api.DELETE('/pets/{pet_id}/vaccinations/{id}', {
        params: { path: { pet_id: petId, id: dialogVaccination.id } },
      }),
    ).catch((error: unknown) => {
      refetchAfterFailure(queryClient, queryKey)
      throw error
    })
    storeRecord(queryClient, queryKey, dialogVaccination, { remove: true })
    onStatus('Прививка удалена.')
    closeDialog({ gone: true })
  }

  return (
    <>
      <HealthSection
        title="Прививки"
        addLabel="Внести из ветпаспорта"
        onAdd={() => openDialog('add')}
        listRef={listRef}
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
                  onEdit={() => openDialog('edit', vaccination)}
                  onDelete={() => openDialog('delete', vaccination)}
                />
              </li>
            ))}
          </ul>
        )}
      </HealthSection>
      <VaccinationFormModal
        open={dialog.open && (dialog.kind === 'add' || dialog.kind === 'edit')}
        petId={petId}
        vaccination={dialog.kind === 'edit' ? dialogVaccination : undefined}
        onClose={() => closeDialog()}
        onSaved={() => {
          onStatus(dialog.kind === 'add' ? 'Прививка добавлена.' : 'Прививка сохранена.')
          closeDialog()
        }}
      />
      <ConfirmActionModal
        open={dialog.open && dialog.kind === 'delete'}
        title="Удалить прививку"
        submit="Удалить"
        submitting="Удаляем…"
        onConfirm={remove}
        onClose={() => closeDialog()}
      >
        <p className="text-sm">
          Прививка <span className="font-bold break-words">{dialogVaccination?.name}</span>
          {dialogVaccination && ` от ${formatLongDate(dialogVaccination.date)}`} будет удалена, а следующая пропадёт из
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
