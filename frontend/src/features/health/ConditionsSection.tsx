import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Pencil } from 'lucide-react'
import { useId, useState } from 'react'
import { api } from '../../api/client'
import { conditionsQuery, queryKeys, unwrap } from '../../api/queries'
import type { Condition } from '../../api/schema'
import { REQUEST_TIMEOUT_MS } from '../../api/session'
import { Badge, Button } from '../../components/ui'
import { conditionKindLabel, dataSourceLabel } from '../../lib/labels'
import { useFocusAfterRender } from '../../lib/use-focus-after-render'
import { ConditionFormModal } from './ConditionFormModal'
import { ConfirmActionModal } from './ConfirmActionModal'
import { refetchAfterFailure, storeRecord } from './health-cache'
import { HealthSection } from './HealthSection'

interface Dialog {
  kind: 'add' | 'edit' | 'archive'
  condition?: Condition
  /** Закрытое окно хранит свои данные до следующего открытия — заголовок не меняется, пока окно закрывается. */
  open: boolean
}

interface ConditionsSectionProps {
  petId: number
  onStatus: (message: string) => void
}

export function ConditionsSection({ petId, onStatus }: ConditionsSectionProps) {
  const queryClient = useQueryClient()
  const list = useQuery(conditionsQuery(petId))
  const [dialog, setDialog] = useState<Dialog>({ kind: 'add', open: false })
  // Запись ушла в архив вместе с кнопкой, открывшей окно, — без этого фокус упадёт на body.
  const [listRef, focusListLater] = useFocusAfterRender<HTMLDivElement>()

  // Данные записи в окне — из свежего списка; пропала из списка — последние известные.
  const dialogCondition = dialog.condition && (list.data?.find((item) => item.id === dialog.condition?.id) ?? dialog.condition)

  function openDialog(kind: Dialog['kind'], condition?: Condition) {
    // Старое сообщение не висит над открытым окном, а тот же текст после следующего действия озвучится заново.
    onStatus('')
    setDialog({ kind, condition, open: true })
  }

  function closeDialog({ gone = false } = {}) {
    if (dialog.condition && (gone || !list.data?.some((item) => item.id === dialog.condition?.id))) focusListLater()
    setDialog((current) => ({ ...current, open: false }))
  }

  async function archive() {
    if (!dialogCondition) return
    const queryKey = queryKeys.conditions(petId)
    const saved = await unwrap(
      api.POST('/pets/{pet_id}/conditions/{id}/archive', {
        params: { path: { pet_id: petId, id: dialogCondition.id } },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    ).catch((error: unknown) => {
      refetchAfterFailure(queryClient, queryKey)
      throw error
    })
    storeRecord(queryClient, queryKey, saved, { remove: true })
    onStatus('Особенность здоровья перенесена в архив.')
    closeDialog({ gone: true })
  }

  return (
    <>
      <HealthSection
        title="Особенности здоровья"
        addLabel="Добавить"
        onAdd={() => openDialog('add')}
        listRef={listRef}
        list={list}
        loadingLabel="Загружаем особенности здоровья"
        errorTitle="Не удалось загрузить особенности здоровья"
        empty={{
          title: 'Особенностей пока нет',
          description: 'Отметьте аллергии и хронические заболевания — клиника увидит их в карточке питомца.',
        }}
      >
        {(conditions) => (
          <ul className="flex flex-col gap-3">
            {conditions.map((condition) => (
              <li key={condition.id}>
                <ConditionItem
                  condition={condition}
                  onEdit={() => openDialog('edit', condition)}
                  onArchive={() => openDialog('archive', condition)}
                />
              </li>
            ))}
          </ul>
        )}
      </HealthSection>
      <ConditionFormModal
        open={dialog.open && (dialog.kind === 'add' || dialog.kind === 'edit')}
        petId={petId}
        condition={dialog.kind === 'edit' ? dialogCondition : undefined}
        onClose={() => closeDialog()}
        onSaved={() => {
          onStatus(dialog.kind === 'add' ? 'Особенность здоровья добавлена.' : 'Особенность здоровья сохранена.')
          closeDialog()
        }}
      />
      <ConfirmActionModal
        open={dialog.open && dialog.kind === 'archive'}
        title="Перенести в архив"
        submit="В архив"
        submitting="Переносим…"
        onConfirm={archive}
        onClose={() => closeDialog()}
      >
        <p className="text-sm">
          <span className="font-bold break-words">{dialogCondition?.title}</span> пропадёт из особенностей здоровья
          питомца, клиника её больше не увидит. Вернуть запись из архива пока нельзя.
        </p>
      </ConfirmActionModal>
    </>
  )
}

interface ConditionItemProps {
  condition: Condition
  onEdit: () => void
  onArchive: () => void
}

function ConditionItem({ condition, onEdit, onArchive }: ConditionItemProps) {
  const titleId = useId()
  const fromClinic = condition.source === 'clinic'
  // Подпись для скринридера — с названием: в списке много одинаковых «Изменить».
  const forRecord = <span className="sr-only">, {condition.title}</span>

  return (
    <article aria-labelledby={titleId} className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={condition.kind === 'allergy' ? 'coral' : 'lilac'}>{conditionKindLabel[condition.kind]}</Badge>
        {fromClinic && <Badge tone="sky">{dataSourceLabel.clinic}</Badge>}
      </div>
      <h3 id={titleId} className="mt-2 font-extrabold break-words">
        {condition.title}
      </h3>
      {condition.description && (
        <p className="mt-1 text-sm break-words whitespace-pre-line text-ink-muted">{condition.description}</p>
      )}
      {/* Запись клиники владелец только читает (БП §3). */}
      {fromClinic ? (
        <p className="mt-3 text-xs text-ink-muted">Изменить запись может только клиника.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={Pencil} onClick={onEdit}>
            Изменить{forRecord}
          </Button>
          <Button variant="secondary" size="sm" icon={Archive} onClick={onArchive}>
            В архив{forRecord}
          </Button>
        </div>
      )}
    </article>
  )
}
