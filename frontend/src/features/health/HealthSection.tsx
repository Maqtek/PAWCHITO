import { Plus } from 'lucide-react'
import { useId, type ReactNode, type Ref } from 'react'
import { Button, Card, EmptyState, Spinner } from '../../components/ui'

interface HealthSectionProps<T> {
  title: string
  /** Видимая подпись кнопки добавления; для скринридера к ней добавляется название раздела. */
  addLabel: string
  onAdd: () => void
  /** Сюда уходит фокус, когда запись пропала из списка вместе с кнопкой, открывшей окно. */
  listRef: Ref<HTMLDivElement>
  list: { data: T[] | undefined; isPending: boolean; refetch: () => unknown }
  loadingLabel: string
  errorTitle: string
  empty: { title: string; description: string }
  children: (items: T[]) => ReactNode
}

/** Раздел «Истории»: заголовок с кнопкой добавления, загрузка, ошибка с «Повторить», пустой список или записи. */
export function HealthSection<T>({
  title,
  addLabel,
  onAdd,
  listRef,
  list,
  loadingLabel,
  errorTitle,
  empty,
  children,
}: HealthSectionProps<T>) {
  const headingId = useId()

  function content() {
    if (list.isPending) return <Spinner label={loadingLabel} />
    if (!list.data) {
      return (
        <EmptyState
          title={errorTitle}
          description="Проверьте соединение и попробуйте ещё раз."
          action={<Button onClick={() => void list.refetch()}>Повторить</Button>}
        />
      )
    }
    if (list.data.length === 0) return <EmptyState title={empty.title} description={empty.description} />
    return children(list.data)
  }

  return (
    <section aria-labelledby={headingId}>
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={headingId} className="text-lg font-extrabold">
            {title}
          </h2>
          <Button variant="secondary" size="sm" icon={Plus} onClick={onAdd}>
            {addLabel}
            <span className="sr-only">: {title.toLowerCase()}</span>
          </Button>
        </div>
        {/* tabIndex -1: сюда уходит фокус, когда запись пропала из списка вместе со своей кнопкой. */}
        <div ref={listRef} tabIndex={-1} className="mt-4 outline-none">
          {content()}
        </div>
      </Card>
    </section>
  )
}
