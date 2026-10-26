import type { ReactNode } from 'react'
import type { CalendarEvent } from '../../api/schema'
import { SectionCard } from '../../components/ui'

interface CalendarGroupProps {
  title: string
  /** День или период группы — под заголовком мелко. */
  period: string
  events: CalendarEvent[]
  renderEvent: (event: CalendarEvent) => ReactNode
}

/** Группа календаря: «Сегодня», «Завтра» или «Позже»; события — в порядке сервера (Р-65). */
export function CalendarGroup({ title, period, events, renderEvent }: CalendarGroupProps) {
  return (
    <SectionCard title={title} subtitle={period}>
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
    </SectionCard>
  )
}
