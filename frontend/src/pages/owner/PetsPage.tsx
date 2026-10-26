import { PawPrint, Plus } from 'lucide-react'
import { useState } from 'react'
import type { Pet, PetArchived } from '../../api/schema'
import { Button, EmptyState, LoadError, PageStatus, Spinner } from '../../components/ui'
import { PetArchiveModal } from '../../features/pets/PetArchiveModal'
import { PetFormModal } from '../../features/pets/PetFormModal'
import { PetListItem } from '../../features/pets/PetListItem'
import { useSelectedPet } from '../../features/pets/useSelectedPet'
import { PageHeader } from '../../layouts/PageHeader'
import { NBSP, pluralize } from '../../lib/format'
import { useFocusAfterRender } from '../../lib/use-focus-after-render'

interface Dialog {
  kind: 'add' | 'edit' | 'archive'
  /** Питомец, для которого открыто окно; у добавления его нет. */
  pet?: Pet
  /** Закрытое окно хранит свои данные до следующего открытия — заголовок не меняется, пока окно закрывается. */
  open: boolean
}

/** «Питомец перенесён в архив: отменены 2 записи, удалено 5 дел.» — числа только ненулевые. */
function archivedMessage({ cancelled_appointments: cancelled, deleted_reminders: deleted }: PetArchived): string {
  const details = [
    cancelled > 0 &&
      `${pluralize(cancelled, ['отменена', 'отменены', 'отменено'])} ${cancelled}${NBSP}${pluralize(cancelled, ['запись', 'записи', 'записей'])}`,
    deleted > 0 &&
      `${pluralize(deleted, ['удалено', 'удалены', 'удалено'])} ${deleted}${NBSP}${pluralize(deleted, ['дело', 'дела', 'дел'])}`,
  ].filter(Boolean)
  return details.length > 0 ? `Питомец перенесён в архив: ${details.join(', ')}.` : 'Питомец перенесён в архив.'
}

export function PetsPage() {
  const { pets, pet: selectedPet, select, isPending, isError, refetch } = useSelectedPet()
  const [now] = useState(() => new Date())
  const [dialog, setDialog] = useState<Dialog>({ kind: 'add', open: false })
  const [status, setStatus] = useState('')
  // Питомец ушёл в архив вместе с кнопкой, открывшей окно, — без этого фокус упадёт на body.
  const [listRef, focusListLater] = useFocusAfterRender<HTMLDivElement>()

  // Данные питомца в окне — из свежего списка; пропал из списка — последние известные.
  const dialogPet = dialog.pet && (pets.find((pet) => pet.id === dialog.pet?.id) ?? dialog.pet)

  function openDialog(kind: Dialog['kind'], pet?: Pet) {
    // Старое сообщение не висит над открытым окном, а тот же текст после следующего действия озвучится заново.
    setStatus('')
    setDialog({ kind, pet, open: true })
  }

  function closeDialog({ petGone = false } = {}) {
    // Питомца нет в списке: ушёл в архив после подтверждения или после ошибки, когда архивирование всё же применилось.
    if (dialog.pet && (petGone || !pets.some((pet) => pet.id === dialog.pet?.id))) focusListLater()
    setDialog((current) => ({ ...current, open: false }))
  }

  const addButton = (
    <Button icon={Plus} onClick={() => openDialog('add')}>
      Добавить питомца
    </Button>
  )

  function content() {
    if (isPending) return <Spinner label="Загружаем питомцев" />
    if (pets.length === 0 && isError) return <LoadError title="Не удалось загрузить питомцев" onRetry={() => void refetch()} />
    if (pets.length === 0) {
      return (
        <EmptyState
          icon={PawPrint}
          title="Питомцев пока нет"
          description="Добавьте питомца — по нему будут работать главная, дела, история и записи к врачу."
          action={addButton}
        />
      )
    }
    return (
      <ul className="grid grid-cols-1 gap-3">
        {pets.map((pet) => (
          <li key={pet.id}>
            <PetListItem
              pet={pet}
              today={now}
              selected={pet.id === selectedPet?.id}
              onSelect={() => {
                select(pet.id)
                setStatus(`Выбран питомец ${pet.name}.`)
              }}
              onEdit={() => openDialog('edit', pet)}
              onArchive={() => openDialog('archive', pet)}
            />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <>
      <PageHeader
        title="Питомцы"
        description="Добавляйте питомцев, меняйте их данные и переносите в архив."
        actions={pets.length > 0 ? addButton : undefined}
      />
      <PageStatus message={status} />
      {/* tabIndex -1: сюда уходит фокус, когда питомец пропал из списка вместе со своей кнопкой. */}
      <div ref={listRef} tabIndex={-1} className="max-w-2xl outline-none">
        {content()}
      </div>
      <PetFormModal
        open={dialog.open && (dialog.kind === 'add' || dialog.kind === 'edit')}
        pet={dialog.kind === 'edit' ? dialogPet : undefined}
        onClose={() => closeDialog()}
        onSaved={(pet) => {
          if (dialog.kind === 'add') {
            // Новый питомец сразу выбран: владелец добавил его, чтобы им заниматься.
            select(pet.id)
            setStatus(`Питомец ${pet.name} добавлен и выбран.`)
          } else {
            setStatus('Данные питомца сохранены.')
          }
          closeDialog()
        }}
      />
      <PetArchiveModal
        open={dialog.open && dialog.kind === 'archive'}
        pet={dialogPet}
        onClose={() => closeDialog()}
        onDone={(result) => {
          setStatus(archivedMessage(result))
          closeDialog({ petGone: true })
        }}
      />
    </>
  )
}
