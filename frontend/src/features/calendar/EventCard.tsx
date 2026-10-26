import { useId, type ReactNode } from 'react'

interface EventCardProps {
  /** Когда: «сегодня, 18:00», «пятница, 30 октября». */
  when: string
  /** Заголовок — имя карточки для скринридера. */
  title: string
  /** Справа от заголовка: статус, тип события. */
  badges: ReactNode
  /** Под шапкой: подробности и кнопки. */
  children: ReactNode
}

/** Событие календаря — дело, запись к врачу, срок прививки: когда, что и бейджи, ниже подробности. */
export function EventCard({ when, title, badges, children }: EventCardProps) {
  const titleId = useId()

  return (
    <article aria-labelledby={titleId} className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink-muted first-letter:uppercase">{when}</p>
          <h3 id={titleId} className="font-extrabold break-words">
            {title}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">{badges}</div>
      </div>
      {children}
    </article>
  )
}
