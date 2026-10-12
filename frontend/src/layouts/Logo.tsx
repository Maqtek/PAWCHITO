import { cn } from '../lib/cn'

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <img src="/images/paw-logo.svg" alt="" className="size-8" />
      {!compact && <span className="text-xl font-black tracking-[0.08em] text-ink">PAWCHITO</span>}
    </span>
  )
}
