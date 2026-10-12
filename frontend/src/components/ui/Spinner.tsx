import { LoaderCircle } from 'lucide-react'
import { cn } from '../../lib/cn'

export function Spinner({ label = 'Загрузка', className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-ink-muted', className)}>
      <LoaderCircle aria-hidden className="size-5 animate-spin text-primary" />
      <span className="sr-only">{label}</span>
    </span>
  )
}
