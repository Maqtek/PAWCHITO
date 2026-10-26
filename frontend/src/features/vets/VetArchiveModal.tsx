import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api/client'
import { unwrap } from '../../api/queries'
import type { Vet } from '../../api/schema'
import { REQUEST_TIMEOUT_MS } from '../../api/session'
import { Button, FormAlert, Modal } from '../../components/ui'
import { useForm } from '../../lib/use-form'
import { refetchVetsAfterFailure, storeVet } from './vet-cache'

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
  const [busy, setBusy] = useState(false)
  return (
    <Modal open={open} onClose={onClose} title={texts[action].title} dismissible={!busy}>
      {open && vet && <ArchiveConfirm action={action} vet={vet} onBusyChange={setBusy} onCancel={onClose} onDone={onDone} />}
    </Modal>
  )
}

interface ArchiveConfirmProps {
  action: ArchiveAction
  vet: Vet
  /** Запрос идёт: окно нельзя закрыть, иначе врач перейдёт, а ответ или ошибку показать будет некому. */
  onBusyChange: (busy: boolean) => void
  onCancel: () => void
  onDone: (vet: Vet) => void
}

function ArchiveConfirm({ action, vet, onBusyChange, onCancel, onDone }: ArchiveConfirmProps) {
  const queryClient = useQueryClient()
  const form = useForm({
    initial: {},
    validate: () => ({}),
    context: 'vet',
    onSubmit: async () => {
      onBusyChange(true)
      try {
        // Окно до ответа не закрыть — без таймаута на зависшей сети оно висело бы вечно.
        const params = { path: { id: vet.id } }
        const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        const saved = await unwrap(
          action === 'archive'
            ? api.POST('/clinic/vets/{id}/archive', { params, signal })
            : api.POST('/clinic/vets/{id}/restore', { params, signal }),
        ).catch((error: unknown) => {
          refetchVetsAfterFailure(queryClient)
          throw error
        })
        storeVet(queryClient, saved)
        onDone(saved)
      } finally {
        onBusyChange(false)
      }
    },
  })

  // Не disabled и без действия на время запроса: отправленное не отменить, а окно должно дождаться ответа.
  function cancel() {
    if (!form.submitting) onCancel()
  }

  const name = <span className="font-bold break-words">{vet.full_name}</span>

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
      {action === 'archive' ? (
        <>
          <p className="text-sm">
            {name} не будет предлагаться для новой записи. История приёмов сохранится, врача можно вернуть из архива.
          </p>
          <p className="text-sm">Будущие записи врача не отменяются — клиника увидит их среди записей, требующих решения.</p>
        </>
      ) : (
        <p className="text-sm">
          {/* Архивирование не снимает отпуск (Р-39): врач вернётся таким, каким ушёл. */}
          {vet.on_vacation ? (
            <>{name} вернётся из архива в отпуске: для записи врач появится, когда отпуск снимут.</>
          ) : (
            <>{name} снова будет предлагаться для записи.</>
          )}
        </p>
      )}
      <FormAlert message={form.formError} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" aria-disabled={form.submitting} onClick={cancel}>
          Отмена
        </Button>
        {/* Не disabled: с выключенной кнопки фокус уходит на body. Повторную отправку отсекает useForm. */}
        <Button type="submit" variant={action === 'archive' ? 'danger' : 'primary'} aria-disabled={form.submitting}>
          {form.submitting ? texts[action].submitting : texts[action].submit}
        </Button>
      </div>
    </form>
  )
}
