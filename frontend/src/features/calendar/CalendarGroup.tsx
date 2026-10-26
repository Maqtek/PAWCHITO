import { useId, type ReactNode } from 'react'
import type { CalendarEvent } from '../../api/schema'
import { Card } from '../../components/ui'

interface CalendarGroupProps {
  title: string
  /** День или период группы — под заголовком мелко. */
  period: string
  events: CalendarEvent[]
  renderEvent: (event: CalendarEvent) => ReactNode
}

/** Группа календаря: «Сегодня», «Завтра» или «Позже»; события — в порядке сервера (Р-65). */
export function CalendarGroup({ title, period, events, renderEvent }: CalendarGroupProps) {
  const headingId = useId()

  return (
    <section aria-labelledby={headingId}>
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id={headingId} className="text-lg font-extrabold">
            {title}
          </h2>
          <p className="text-sm text-ink-muted">{period}</p>
        </div>
        {events.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Ничего нет</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {/* id у дел, записей и прививок свои — ключ с типом. */}
            {events.map((event) => (
              <li key={`${event.type}-${event.id}`}>{renderEvent(event)}</li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  )
}
