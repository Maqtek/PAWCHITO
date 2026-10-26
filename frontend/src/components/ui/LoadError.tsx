import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './Button'
import { EmptyState } from './EmptyState'

export interface LoadErrorProps {
  title: string
  onRetry: () => void
  icon?: LucideIcon
  description?: ReactNode
  className?: string
}

/** Данные не загрузились: что именно, совет и кнопка «Повторить». */
export function LoadError({
  title,
  onRetry,
  icon,
  description = 'Проверьте соединение и попробуйте ещё раз.',
  className,
}: LoadErrorProps) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      action={<Button onClick={onRetry}>Повторить</Button>}
      className={className}
    />
  )
}
