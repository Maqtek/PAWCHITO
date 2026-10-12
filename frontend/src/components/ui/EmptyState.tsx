import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-card border border-dashed border-line bg-surface-muted px-6 py-10 text-center',
        className,
      )}
    >
      {Icon && (
        <span className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
          <Icon aria-hidden className="size-6" />
        </span>
      )}
      <h3 className="text-base font-extrabold text-ink">{title}</h3>
      {description && <p className="max-w-md text-sm text-ink-muted">{description}</p>}
      {action}
    </div>
  )
}
