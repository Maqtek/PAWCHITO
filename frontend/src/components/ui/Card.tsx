import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type CardTone = 'default' | 'muted' | 'primary' | 'sand'

const toneClass: Record<CardTone, string> = {
  default: 'border-line bg-surface',
  muted: 'border-line bg-surface-muted',
  primary: 'border-primary-line bg-primary-soft',
  sand: 'border-transparent bg-sand',
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone
}

export function Card({ tone = 'default', className, ...props }: CardProps) {
  return <div className={cn('rounded-card border shadow-card', toneClass[tone], className)} {...props} />
}
