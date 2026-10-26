import { useQueryClient } from '@tanstack/react-query'
import { Archive, Pencil, RotateCcw, TreePalm } from 'lucide-react'
import { useId, useState } from 'react'
import { api } from '../../api/client'
import { errorMessage } from '../../api/error-messages'
import { unwrap } from '../../api/queries'
import type { Vet } from '../../api/schema'
import { Badge, Button, FormAlert } from '../../components/ui'
import { saveVet } from './vet-cache'
import type { ArchiveAction } from './VetArchiveModal'

interface VetCardProps {
  vet: Vet
  onStatus: (message: string) => void
  /** Окна — у страницы: врач может уйти в другую вкладку, а окно с ответом или ошибкой должно остаться. */
  onEdit: () => void
  onArchiveAction: (action: ArchiveAction) => void
}

export function VetCard({ vet, onStatus, onEdit, onArchiveAction }: VetCardProps) {
  const queryClient = useQueryClient()
  const nameId = useId()
  const [toggling, setToggling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const archived = vet.archived_at !== null

  // Старое сообщение и ошибка не висят над новым действием, а тот же текст после него озвучится заново.
  function startAction() {
    onStatus('')
    setError(null)
  }

  // Отпуск — без подтверждения: флаг снимается так же одной кнопкой, записи он не отменяет (БП §4).
  async function toggleVacation() {
    if (toggling) return
    startAction()
    setToggling(true)
    try {
      const saved = await saveVet(
        queryClient,
        unwrap(
          api.PATCH('/clinic/vets/{id}', {
            params: { path: { id: vet.id } },
            body: { on_vacation: !vet.on_vacation },
          }),
        ),
      )
      onStatus(
        saved.on_vacation
          ? 'Отпуск отмечен: врач не предлагается для записи. Его будущие записи не отменяются.'
          : 'Отпуск снят: врач снова доступен для записи.',
      )
    } catch (failure) {
      setError(errorMessage(failure, 'vet'))
    } finally {
      setToggling(false)
    }
  }

  // Подпись для скринридера — с ФИО: в списке много одинаковых «Изменить».
  const forVet = <span className="sr-only">, {vet.full_name}</span>

  return (
    <article aria-labelledby={nameId} className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={nameId} className="font-extrabold break-words">
            {vet.full_name}
          </h2>
          <p className="mt-1 text-sm break-words text-ink-muted">{vet.specialization ?? 'Специализация не указана'}</p>
        </div>
        {/* В архиве флаг отпуска ни на что не влияет (Р-39) — не показываем. */}
        {!archived && vet.on_vacation && <Badge tone="butter">В отпуске</Badge>}
      </div>
      {error && (
        <div className="mt-3">
          <FormAlert message={error} />
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={Pencil}
          onClick={() => {
            startAction()
            onEdit()
          }}
        >
          Изменить{forVet}
        </Button>
        {archived ? (
          <Button
            variant="secondary"
            size="sm"
            icon={RotateCcw}
            onClick={() => {
              startAction()
              onArchiveAction('restore')
            }}
          >
            Вернуть из архива{forVet}
          </Button>
        ) : (
          <>
            {/* Не disabled: фокус остаётся на кнопке, повторное нажатие отсекает toggling. */}
            <Button
              variant="secondary"
              size="sm"
              icon={TreePalm}
              aria-disabled={toggling}
              onClick={() => void toggleVacation()}
            >
              {toggling ? 'Сохраняем…' : vet.on_vacation ? 'Снять отпуск' : 'Отметить отпуск'}
              {forVet}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={Archive}
              onClick={() => {
                startAction()
                onArchiveAction('archive')
              }}
            >
              В архив{forVet}
            </Button>
          </>
        )}
      </div>
    </article>
  )
}
