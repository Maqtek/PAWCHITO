import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import type { Tone } from '../../lib/labels'
import { toneSoftClass } from './tone'

export interface BadgeProps {
  tone?: Tone
  dot?: boolean
  active?: boolean
  className?: string
  children: ReactNode
}

export function Badge({ tone = 'neutral', dot, active, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-bold whitespace-nowrap',
        toneSoftClass[tone],
        active && 'ring-2 ring-current/25',
        className,
      )}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export interface CountBadgeProps {
  count: number
  /** Без подписи счётчик декоративный — например, когда число уже есть в подписи кнопки. */
  label?: string
  className?: string
}

export function CountBadge({ count, label, className }: CountBadgeProps) {
  if (count <= 0) return null
  return (
    <span
      aria-hidden={label ? undefined : true}
      className={cn(
        'grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1.5 text-[11px] leading-none font-extrabold text-white',
        className,
      )}
    >
      {label && <span className="sr-only">{label}</span>}
      <span aria-hidden={label ? true : undefined}>{count > 99 ? '99+' : count}</span>
    </span>
  )
}
