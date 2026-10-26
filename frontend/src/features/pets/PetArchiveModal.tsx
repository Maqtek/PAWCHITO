import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import { unwrap } from '../../api/queries'
import type { Pet, PetArchived } from '../../api/schema'
import { ConfirmActionModal } from '../../components/ConfirmActionModal'
import { refetchPetsAfterFailure, storePet } from './pet-cache'

interface PetArchiveModalProps {
  open: boolean
  pet?: Pet
  onClose: () => void
  onDone: (result: PetArchived) => void
}

/** Подтверждение архивирования. Возврата из архива в MVP нет (Р-40) — окно об этом предупреждает. */
export function PetArchiveModal({ open, pet, onClose, onDone }: PetArchiveModalProps) {
  const queryClient = useQueryClient()

  async function archive() {
    if (!pet) return
    const result = await unwrap(
      api.POST('/pets/{pet_id}/archive', {
        params: { path: { pet_id: pet.id } },
      }),
    ).catch((error: unknown) => {
      refetchPetsAfterFailure(queryClient)
      throw error
    })
    storePet(queryClient, result.pet)
    onDone(result)
  }

  return (
    <ConfirmActionModal
      open={open}
      title="Перенести в архив"
      submitLabel="В архив"
      submittingLabel="Переносим…"
      context="pet"
      onConfirm={archive}
      onClose={onClose}
    >
      <p className="text-sm">
        <span className="font-bold break-words">{pet?.name}</span> пропадёт из списка питомцев и из переключателя.
        Вернуть питомца из архива пока нельзя.
      </p>
      <p className="text-sm">
        Будущие записи к врачу отменятся, клиники получат уведомление. Запланированные дела удалятся. История приёмов
        у клиник сохранится.
      </p>
    </ConfirmActionModal>
  )
}
