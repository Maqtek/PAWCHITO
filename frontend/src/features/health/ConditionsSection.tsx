import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Pencil } from 'lucide-react'
import { useId } from 'react'
import { api } from '../../api/client'
import { conditionsQuery, queryKeys, unwrap } from '../../api/queries'
import type { Condition } from '../../api/schema'
import { ConfirmActionModal } from '../../components/ConfirmActionModal'
import { Badge, Button } from '../../components/ui'
import { conditionKindLabel, conditionKindTone, dataSourceLabel } from '../../lib/labels'
import { ConditionFormModal } from './ConditionFormModal'
import { saveRecord } from './health-cache'
import { HealthSection } from './HealthSection'
import { useRecordDialog } from './use-record-dialog'

interface ConditionsSectionProps {
  petId: number
  onStatus: (message: string) => void
}

export function ConditionsSection({ petId, onStatus }: ConditionsSectionProps) {
  const queryClient = useQueryClient()
  const list = useQuery(conditionsQuery(petId))
  // Запись ушла в архив вместе с кнопкой, открывшей окно, — фокус уходит на список.
  const dialog = useRecordDialog<'add' | 'edit' | 'archive', Condition>(list.data, onStatus)

  async function archive() {
    if (!dialog.record) return
    await saveRecord(
      queryClient,
      queryKeys.conditions(petId),
      unwrap(
        api.POST('/pets/{pet_id}/conditions/{id}/archive', {
          params: { path: { pet_id: petId, id: dialog.record.id } },
        }),
      ),
      { remove: true },
    )
    onStatus('Особенность здоровья перенесена в архив.')
    dialog.close({ gone: true })
  }

  return (
    <>
      <HealthSection
        title="Особенности здоровья"
        addLabel="Добавить"
        onAdd={() => dialog.open('add')}
        listRef={dialog.listRef}
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
                  onEdit={() => dialog.open('edit', condition)}
                  onArchive={() => dialog.open('archive', condition)}
                />
              </li>
            ))}
          </ul>
        )}
      </HealthSection>
      <ConditionFormModal
        open={dialog.isOpen && (dialog.kind === 'add' || dialog.kind === 'edit')}
        petId={petId}
        condition={dialog.kind === 'edit' ? dialog.record : undefined}
        onClose={() => dialog.close()}
        onSaved={() => {
          onStatus(dialog.kind === 'add' ? 'Особенность здоровья добавлена.' : 'Особенность здоровья сохранена.')
          dialog.close()
        }}
      />
      <ConfirmActionModal
        open={dialog.isOpen && dialog.kind === 'archive'}
        title="Перенести в архив"
        submitLabel="В архив"
        submittingLabel="Переносим…"
        context="health"
        onConfirm={archive}
        onClose={() => dialog.close()}
      >
        <p className="text-sm">
          <span className="font-bold break-words">{dialog.record?.title}</span> пропадёт из особенностей здоровья
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
        <Badge tone={conditionKindTone[condition.kind]}>{conditionKindLabel[condition.kind]}</Badge>
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
