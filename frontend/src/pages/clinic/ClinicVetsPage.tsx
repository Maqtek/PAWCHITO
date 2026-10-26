import { useQuery } from '@tanstack/react-query'
import { Plus, Stethoscope } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { clinicVetsQuery } from '../../api/queries'
import type { Vet } from '../../api/schema'
import { Button, EmptyState, LoadError, PageStatus, Spinner, Tabs } from '../../components/ui'
import { VetArchiveModal, type ArchiveAction } from '../../features/vets/VetArchiveModal'
import { VetCard } from '../../features/vets/VetCard'
import { VetFormModal } from '../../features/vets/VetFormModal'
import { PageHeader } from '../../layouts/PageHeader'

type View = 'active' | 'archived'

interface Dialog {
  kind: 'add' | 'edit' | ArchiveAction
  /** Врач, для которого открыто окно; у добавления его нет. */
  vet?: Vet
  /** Закрытое окно хранит свои данные до следующего открытия — заголовок не меняется, пока окно закрывается. */
  open: boolean
}

const collator = new Intl.Collator('ru')
const byName = (a: Vet, b: Vet) => collator.compare(a.full_name, b.full_name)

export function ClinicVetsPage() {
  const { data: vets, isPending, refetch } = useQuery(clinicVetsQuery)
  const [view, setView] = useState<View>('active')
  const [dialog, setDialog] = useState<Dialog>({ kind: 'add', open: false })
  const [status, setStatus] = useState('')
  const tabsRef = useRef<HTMLDivElement>(null)
  const focusTabs = useRef(false)

  // Врач ушёл в другую вкладку вместе с кнопкой, открывшей окно, — без этого фокус упадёт на body.
  // Эффект Modal (дочерний) уже закрыл окно и вернул фокус, вкладка получает его последней.
  useEffect(() => {
    if (!focusTabs.current) return
    focusTabs.current = false
    tabsRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()
  })

  const sorted = vets ? [...vets].sort(byName) : []
  const active = sorted.filter((vet) => vet.archived_at === null)
  const archived = sorted.filter((vet) => vet.archived_at !== null)
  const shown = view === 'active' ? active : archived
  // Данные врача в окне — из свежего списка; пропал из списка — последние известные.
  const dialogVet = dialog.vet && (vets?.find((vet) => vet.id === dialog.vet?.id) ?? dialog.vet)

  function openDialog(kind: Dialog['kind'], vet?: Vet) {
    // Старое сообщение не висит над открытым окном, а тот же текст после следующего действия озвучится заново.
    setStatus('')
    setDialog({ kind, vet, open: true })
  }

  function closeDialog({ vetMoved = false } = {}) {
    // Врача нет в этой вкладке: ушёл после подтверждения или после ошибки, когда изменение всё же применилось.
    if (dialog.vet && (vetMoved || !shown.some((vet) => vet.id === dialog.vet?.id))) focusTabs.current = true
    setDialog((current) => ({ ...current, open: false }))
  }

  function emptyState() {
    if (vets?.length === 0) {
      return (
        <EmptyState
          icon={Stethoscope}
          title="Врачей пока нет"
          description="Добавьте врачей — владельцы питомцев смогут записываться к ним."
        />
      )
    }
    if (view === 'active') {
      return <EmptyState title="Активных врачей нет" description="Верните врача из архива или добавьте нового." />
    }
    return <EmptyState title="Архив пуст" description="Сюда попадают врачи, которые больше не принимают." />
  }

  function content() {
    if (isPending) return <Spinner label="Загружаем врачей" />
    if (!vets) return <LoadError title="Не удалось загрузить врачей" onRetry={() => void refetch()} />
    return (
      <div className="flex flex-col gap-4">
        <div ref={tabsRef}>
          <Tabs
            label="Врачи"
            value={view}
            onChange={setView}
            items={[
              { id: 'active', label: `Активные (${active.length})` },
              { id: 'archived', label: `Архив (${archived.length})` },
            ]}
          />
        </div>
        {shown.length > 0 ? (
          <ul className="grid grid-cols-1 gap-3">
            {shown.map((vet) => (
              <li key={vet.id}>
                <VetCard
                  vet={vet}
                  onStatus={setStatus}
                  onEdit={() => openDialog('edit', vet)}
                  onArchiveAction={(action) => openDialog(action, vet)}
                />
              </li>
            ))}
          </ul>
        ) : (
          emptyState()
        )}
      </div>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Кабинет клиники"
        title="Врачи"
        description="Состав клиники, отпуска и архив."
        actions={
          <Button icon={Plus} onClick={() => openDialog('add')}>
            Добавить врача
          </Button>
        }
      />
      <PageStatus message={status} />
      <div className="max-w-2xl">{content()}</div>
      <VetFormModal
        open={dialog.open && (dialog.kind === 'add' || dialog.kind === 'edit')}
        vet={dialog.kind === 'edit' ? dialogVet : undefined}
        onClose={() => closeDialog()}
        onSaved={() => {
          if (dialog.kind === 'add') {
            // Новый врач — среди активных: показываем вкладку, где он появился.
            setView('active')
            setStatus('Врач добавлен.')
          } else {
            setStatus('Данные врача сохранены.')
          }
          closeDialog()
        }}
      />
      <VetArchiveModal
        open={dialog.open && (dialog.kind === 'archive' || dialog.kind === 'restore')}
        action={dialog.kind === 'restore' ? 'restore' : 'archive'}
        vet={dialogVet}
        onClose={() => closeDialog()}
        onDone={(vet) => {
          if (dialog.kind === 'archive') setStatus('Врач перенесён в архив. Его будущие записи не отменяются.')
          else setStatus(vet.on_vacation ? 'Врач возвращён из архива и всё ещё в отпуске.' : 'Врач возвращён из архива.')
          closeDialog({ vetMoved: true })
        }}
      />
    </>
  )
}
