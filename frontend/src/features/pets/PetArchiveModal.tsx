import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api/client'
import { unwrap } from '../../api/queries'
import type { Pet, PetArchived } from '../../api/schema'
import { REQUEST_TIMEOUT_MS } from '../../api/session'
import { Button, FormAlert, Modal } from '../../components/ui'
import { useForm } from '../../lib/use-form'
import { refetchPetsAfterFailure, storePet } from './pet-cache'

interface PetArchiveModalProps {
  open: boolean
  pet?: Pet
  onClose: () => void
  onDone: (result: PetArchived) => void
}

/** Подтверждение архивирования. Возврата из архива в MVP нет (Р-40) — окно об этом предупреждает. */
export function PetArchiveModal({ open, pet, onClose, onDone }: PetArchiveModalProps) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal open={open} onClose={onClose} title="Перенести в архив" dismissible={!busy}>
      {open && pet && <ArchiveConfirm pet={pet} onBusyChange={setBusy} onCancel={onClose} onDone={onDone} />}
    </Modal>
  )
}

interface ArchiveConfirmProps {
  pet: Pet
  /** Запрос идёт: окно нельзя закрыть, иначе питомец уйдёт в архив, а ответ или ошибку показать будет некому. */
  onBusyChange: (busy: boolean) => void
  onCancel: () => void
  onDone: (result: PetArchived) => void
}

function ArchiveConfirm({ pet, onBusyChange, onCancel, onDone }: ArchiveConfirmProps) {
  const queryClient = useQueryClient()
  const form = useForm({
    initial: {},
    validate: () => ({}),
    context: 'pet',
    onSubmit: async () => {
      onBusyChange(true)
      try {
        // Окно до ответа не закрыть — без таймаута на зависшей сети оно висело бы вечно.
        const result = await unwrap(
          api.POST('/pets/{pet_id}/archive', {
            params: { path: { pet_id: pet.id } },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          }),
        ).catch((error: unknown) => {
          refetchPetsAfterFailure(queryClient)
          throw error
        })
        storePet(queryClient, result.pet)
        onDone(result)
      } finally {
        onBusyChange(false)
      }
    },
  })

  // Не disabled и без действия на время запроса: отправленное не отменить, а окно должно дождаться ответа.
  function cancel() {
    if (!form.submitting) onCancel()
  }

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm">
        <span className="font-bold break-words">{pet.name}</span> пропадёт из списка питомцев и из переключателя.
        Вернуть питомца из архива пока нельзя.
      </p>
      <p className="text-sm">
        Будущие записи к врачу отменятся, клиники получат уведомление. Запланированные дела удалятся. История приёмов
        у клиник сохранится.
      </p>
      <FormAlert message={form.formError} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" aria-disabled={form.submitting} onClick={cancel}>
          Отмена
        </Button>
        {/* Не disabled: с выключенной кнопки фокус уходит на body. Повторную отправку отсекает useForm. */}
        <Button type="submit" variant="danger" aria-disabled={form.submitting}>
          {form.submitting ? 'Переносим…' : 'В архив'}
        </Button>
      </div>
    </form>
  )
}
