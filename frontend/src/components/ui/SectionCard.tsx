import { useId, type ReactNode } from 'react'
import { Card } from './Card'

export interface SectionCardProps {
  title: string
  /** Справа от заголовка: кнопка или ссылка раздела. */
  action?: ReactNode
  /** Пояснение в строку с заголовком: период, дата начала. */
  subtitle?: ReactNode
  className?: string
  children: ReactNode
}

/** Раздел страницы в карточке: section, подписанный своим заголовком h2, — скринридер перечисляет его среди областей. */
export function SectionCard({ title, action, subtitle, className, children }: SectionCardProps) {
  const headingId = useId()

  let header = (
    <h2 id={headingId} className="text-lg font-extrabold break-words">
      {title}
    </h2>
  )
  if (subtitle) {
    header = (
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {header}
        <p className="text-sm text-ink-muted">{subtitle}</p>
      </div>
    )
  }
  if (action) {
    header = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        {header}
        {action}
      </div>
    )
  }

  return (
    <section aria-labelledby={headingId} className={className}>
      <Card className="p-5 sm:p-6">
        {header}
        {children}
      </Card>
    </section>
  )
}
