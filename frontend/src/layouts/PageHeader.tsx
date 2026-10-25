import type { ReactNode } from 'react'
import { Eyebrow } from '../components/ui'

export interface PageHeaderProps {
  eyebrow?: string
  title: string
  /** Текст вкладки браузера, если он короче заголовка. По умолчанию — title. */
  documentTitle?: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, documentTitle = title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <title>{`${documentTitle} — PAWCHITO`}</title>
      <div className="min-w-0">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight break-words sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  )
}
