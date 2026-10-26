import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import { unwrap } from '../../api/queries'
import type { Vet } from '../../api/schema'
import { ConfirmActionModal } from '../../components/ConfirmActionModal'
import { saveVet } from './vet-cache'

export type ArchiveAction = 'archive' | 'restore'

const texts: Record<ArchiveAction, { title: string; submit: string; submitting: string }> = {
  archive: { title: 'Перенести в архив', submit: 'В архив', submitting: 'Переносим…' },
  restore: { title: 'Вернуть из архива', submit: 'Вернуть', submitting: 'Возвращаем…' },
}

interface VetArchiveModalProps {
  open: boolean
  action: ArchiveAction
  vet?: Vet
  onClose: () => void
  onDone: (vet: Vet) => void
}

/** Подтверждение архивирования и возврата из архива. */
export function VetArchiveModal({ open, action, vet, onClose, onDone }: VetArchiveModalProps) {
  const queryClient = useQueryClient()

  async function confirm() {
    if (!vet) return
    const params = { path: { id: vet.id } }
    const request =
      action === 'archive'
        ? api.POST('/clinic/vets/{id}/archive', { params })
        : api.POST('/clinic/vets/{id}/restore', { params })
    onDone(await saveVet(queryClient, unwrap(request)))
  }

  return (
    <ConfirmActionModal
      open={open}
      title={texts[action].title}
      submitLabel={texts[action].submit}
      submittingLabel={texts[action].submitting}
      variant={action === 'archive' ? 'danger' : 'primary'}
      context="vet"
      onConfirm={confirm}
      onClose={onClose}
    >
      {vet && <ArchiveText action={action} vet={vet} />}
    </ConfirmActionModal>
  )
}

function ArchiveText({ action, vet }: { action: ArchiveAction; vet: Vet }) {
  const name = <span className="font-bold break-words">{vet.full_name}</span>

  if (action === 'archive') {
    return (
      <>
        <p className="text-sm">
          {name} не будет предлагаться для новой записи. История приёмов сохранится, врача можно вернуть из архива.
        </p>
        <p className="text-sm">Будущие записи врача не отменяются — клиника увидит их среди записей, требующих решения.</p>
      </>
    )
  }
  return (
    <p className="text-sm">
      {/* Архивирование не снимает отпуск (Р-39): врач вернётся таким, каким ушёл. */}
      {vet.on_vacation ? (
        <>{name} вернётся из архива в отпуске: для записи врач появится, когда отпуск снимут.</>
      ) : (
        <>{name} снова будет предлагаться для записи.</>
      )}
    </p>
  )
}
