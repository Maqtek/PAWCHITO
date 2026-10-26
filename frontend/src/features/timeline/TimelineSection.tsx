import { useInfiniteQuery } from '@tanstack/react-query'
import { HistoryIcon } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { timelineQuery } from '../../api/queries'
import type { TimelineItem } from '../../api/schema'
import { Button, EmptyState, FormAlert, LoadError, SectionCard, Spinner } from '../../components/ui'
import { formatLongDate } from '../../lib/format'
import { groupBy } from '../../lib/group-by'
import { timelineItemKey } from './timeline'
import { TimelineEntry } from './TimelineEntry'

/**
 * Лента истории питомца (Р-66): наблюдения, прививки, приёмы с итогом и курсы — по дням, от новых к старым.
 * «Показать ещё» подгружает следующую страницу; фокус переходит на первый новый элемент.
 */
export function TimelineSection({ petId }: { petId: number }) {
  const timeline = useInfiniteQuery(timelineQuery(petId))
  const listRef = useRef<HTMLOListElement>(null)
  const endRef = useRef<HTMLParagraphElement>(null)
  // Сколько элементов было до «Показать ещё»: кнопка может пропасть вместе с концом ленты, фокус не должен упасть на body.
  const focusFrom = useRef<number | null>(null)

  useEffect(() => {
    if (focusFrom.current === null || timeline.isFetchingNextPage) return
    const from = focusFrom.current
    focusFrom.current = null
    // Страница не загрузилась — кнопка на месте, фокус остаётся на ней.
    if (timeline.isFetchNextPageError) return
    const target = listRef.current?.querySelectorAll<HTMLElement>('article')[from] ?? endRef.current
    target?.focus()
  })

  function showMore() {
    if (timeline.isFetchingNextPage) return
    focusFrom.current = timeline.data?.pages.flat().length ?? 0
    void timeline.fetchNextPage()
  }

  function content() {
    if (timeline.isPending) return <Spinner label="Загружаем ленту" />
    if (!timeline.data) return <LoadError title="Не удалось загрузить ленту" onRetry={() => void timeline.refetch()} />
    const items = timeline.data.pages.flat()
    if (items.length === 0) {
      return (
        <EmptyState
          icon={HistoryIcon}
          title="В ленте пока ничего нет"
          description="Здесь появятся наблюдения дневника, прививки, приёмы с итогом и курсы лечения."
        />
      )
    }
    return (
      <>
        <ol ref={listRef} className="flex flex-col gap-5">
          {/* Дни ленты — в порядке сервера. */}
          {groupBy(items, (item) => item.date).map(([date, dayItems]) => (
            <TimelineDay key={date} date={date} items={dayItems} />
          ))}
        </ol>
        {timeline.isFetchNextPageError && (
          <div className="mt-4">
            <FormAlert message="Не удалось загрузить записи раньше. Проверьте соединение и попробуйте ещё раз." />
          </div>
        )}
        {timeline.hasNextPage ? (
          <Button className="mt-4" variant="secondary" aria-disabled={timeline.isFetchingNextPage} onClick={showMore}>
            {timeline.isFetchingNextPage ? 'Загружаем…' : 'Показать ещё'}
          </Button>
        ) : (
          timeline.data.pages.length > 1 && (
            // tabIndex -1: сюда уходит фокус, если последняя страница оказалась пустой.
            <p ref={endRef} tabIndex={-1} className="mt-4 text-sm text-ink-muted outline-none">
              Раньше записей нет.
            </p>
          )
        )}
      </>
    )
  }

  return (
    <SectionCard title="Лента истории">
      <p className="mt-1 text-sm text-ink-muted">Наблюдения, прививки, приёмы с итогом и курсы лечения — от новых к старым.</p>
      <div className="mt-4">{content()}</div>
    </SectionCard>
  )
}

function TimelineDay({ date, items }: { date: string; items: TimelineItem[] }) {
  const dayId = useId()
  return (
    <li>
      <h3 id={dayId} className="text-sm font-extrabold text-ink-muted">
        <time dateTime={date}>{formatLongDate(date)}</time>
      </h3>
      <ul className="mt-2 flex flex-col gap-3">
        {items.map((item) => (
          <li key={timelineItemKey(item)}>
            <TimelineEntry item={item} dayId={dayId} />
          </li>
        ))}
      </ul>
    </li>
  )
}
