import { cn } from '../../lib/cn'

export interface ProgressBarProps {
  value: number
  max: number
  label: string
  className?: string
}

export function ProgressBar({ value, max, label, className }: ProgressBarProps) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn('h-2 overflow-hidden rounded-full bg-primary-line', className)}
    >
      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
    </div>
  )
}
