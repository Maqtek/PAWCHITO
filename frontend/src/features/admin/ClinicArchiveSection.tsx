import { useQuery, useQueryClient } from '@tanstack/react-query'
import { EyeOff, RotateCcw } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { api } from '../../api/client'
import { errorMessage } from '../../api/error-messages'
import { adminClinicQuery, unwrap } from '../../api/queries'
import type { AdminClinic } from '../../api/schema'
import { Button, Card, FormActions, FormAlert, Modal } from '../../components/ui'
import { pluralize } from '../../lib/format'
import { useFocusAfterRender } from '../../lib/use-focus-after-render'
import { useForm } from '../../lib/use-form'
import { saveClinic } from './clinic-cache'

interface ClinicArchiveSectionProps {
  clinic: AdminClinic
  onStatus: (message: string) => void
}

export function ClinicArchiveSection({ clinic, onStatus }: ClinicArchiveSectionProps) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  // Кнопка, с которой начали, исчезает — без этого фокус упадёт на body.
  const [headingRef, focusHeadingLater] = useFocusAfterRender<HTMLHeadingElement>()
  const archived = clinic.archived_at !== null

  function closeConfirm() {
    // Клиника успела скрыться (ответ не дошёл, страница перечитана) — кнопки «Скрыть клинику» уже нет.
    if (archived) focusHeadingLater()
    setConfirming(false)
  }

  async function restore() {
    if (restoring) return
    setRestoring(true)
    setRestoreError(null)
    onStatus('')
    try {
      await saveClinic(
        queryClient,
        unwrap(
          api.POST('/admin/clinics/{id}/restore', {
            params: { path: { id: clinic.id } },
          }),
        ),
        clinic.id,
      )
      focusHeadingLater()
      onStatus('Клиника возвращена.')
    } catch (error) {
      setRestoreError(errorMessage(error, 'clinic'))
    } finally {
      setRestoring(false)
    }
  }

  return (
    <Card className="p-6">
      {/* Без outline-none: рамку фокуса рисует общий :focus-visible. */}
      <h2 ref={headingRef} tabIndex={-1} className="text-lg font-extrabold">
        Скрытие
      </h2>
      {archived ? (
        <>
          <p className="mt-3 text-sm text-ink-muted">
            Клиника скрыта. Возврат разблокирует аккаунт, отменённые записи не восстанавливаются.
          </p>
          <div className="mt-4 flex flex-col items-start gap-3">
            <FormAlert message={restoreError} />
            {/* Не disabled: фокус остаётся на кнопке, повторное нажатие отсекает restoring. */}
            <Button variant="secondary" icon={RotateCcw} aria-disabled={restoring} onClick={() => void restore()}>
              {restoring ? 'Возвращаем…' : 'Вернуть клинику'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-ink-muted">Скрытая клиника не показывается при записи, её аккаунт блокируется.</p>
          <Button
            variant="danger"
            icon={EyeOff}
            className="mt-4"
            onClick={() => {
              onStatus('')
              // Ошибка прошлого возврата (клиника всё же вернулась) не должна всплыть после нового скрытия.
              setRestoreError(null)
              setConfirming(true)
            }}
          >
            Скрыть клинику
          </Button>
        </>
      )}
      <Modal open={confirming} onClose={closeConfirm} title="Скрыть клинику" dismissible={!busy}>
        {confirming && (
          <ArchiveConfirm
            clinic={clinic}
            onBusyChange={setBusy}
            onCancel={closeConfirm}
            onArchived={(cancelled) => {
              focusHeadingLater()
              setConfirming(false)
              onStatus(`Клиника скрыта. Отменено записей: ${cancelled}.`)
            }}
          />
        )}
      </Modal>
    </Card>
  )
}

interface ArchiveConfirmProps {
  clinic: AdminClinic
  /** Запрос идёт: окно нельзя закрыть, иначе записи отменятся, а ответ или ошибку показать будет некому. */
  onBusyChange: (busy: boolean) => void
  onCancel: () => void
  onArchived: (cancelled: number) => void
}

function ArchiveConfirm({ clinic, onBusyChange, onCancel, onArchived }: ArchiveConfirmProps) {
  const queryClient = useQueryClient()
  // Перед скрытием — свежее число записей: пока админ смотрел страницу, владельцы могли записаться.
  const { data: fresh, isFetching, isError } = useQuery({ ...adminClinicQuery(clinic.id), refetchOnMount: 'always' })
  const count = (fresh ?? clinic).future_appointments_count
  const form = useForm({
    initial: {},
    validate: () => ({}),
    context: 'clinic',
    onBusyChange,
    onSubmit: async () => {
      const result = await saveClinic(
        queryClient,
        unwrap(
          api.POST('/admin/clinics/{id}/archive', {
            params: { path: { id: clinic.id } },
          }),
        ),
        clinic.id,
      )
      onArchived(result.cancelled_appointments)
    },
  })

  // Пока число записей обновляется, подтверждать рано.
  function submit(event: FormEvent<HTMLFormElement>) {
    if (isFetching) {
      event.preventDefault()
      return
    }
    void form.handleSubmit(event)
  }

  function appointmentsText(): string {
    if (isFetching) return 'Проверяем будущие записи…'
    // Число из кэша могло устареть, выдавать его за свежее нельзя; скрыть при этом можно.
    if (isError) return 'Не удалось проверить будущие записи. Число отменённых записей покажем после скрытия.'
    if (count === 0) return 'Будущих записей нет.'
    return `Будет отменено ${count} ${pluralize(count, ['запись', 'записи', 'записей'])}. Владельцы получат уведомление.`
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm">{appointmentsText()}</p>
      {clinic.account && <p className="text-sm">Аккаунт клиники будет заблокирован, её сессии завершатся.</p>}
      <FormActions
        error={form.formError}
        submitting={form.submitting}
        blocked={isFetching}
        submitLabel="Скрыть"
        submittingLabel="Скрываем…"
        variant="danger"
        onCancel={onCancel}
      />
    </form>
  )
}
