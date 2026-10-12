import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/** Надпись капителью над заголовком, как «CARE INBOX» в макете. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-[11px] font-extrabold tracking-[0.14em] text-ink-muted uppercase', className)}>
      {children}
    </p>
  )
}
