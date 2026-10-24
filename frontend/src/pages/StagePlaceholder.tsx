import type { LucideIcon } from 'lucide-react'
import { EmptyState } from '../components/ui'
import { cn } from '../lib/cn'

export interface StagePlaceholderProps {
  stage: number
  icon: LucideIcon
  title: string
  description?: string
  className?: string
}

/** Пустой раздел каркаса: что здесь будет и на каком этапе роадмапа. */
export function StagePlaceholder({ stage, icon, title, description, className }: StagePlaceholderProps) {
  return (
    <EmptyState
      className={className}
      icon={icon}
      title={title}
      description={
        <>
          {description}
          <span className={cn('block font-bold text-ink-muted', description && 'mt-1')}>Появится на этапе {stage} роадмапа.</span>
        </>
      }
    />
  )
}
