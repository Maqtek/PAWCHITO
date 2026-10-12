import { cn } from '../../lib/cn'
import { initials } from '../../lib/format'

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-full bg-coral text-sm font-extrabold text-white',
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
