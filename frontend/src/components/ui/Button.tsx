import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { buttonClass, type ButtonSize, type ButtonVariant } from './button-styles'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
  fullWidth?: boolean
}

export function Button({
  variant,
  size,
  icon: Icon,
  fullWidth,
  className,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={cn(buttonClass({ variant, size, fullWidth }), className)} {...props}>
      {Icon && <Icon aria-hidden className="size-4 shrink-0" />}
      {children}
    </button>
  )
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon
  label: string
}

export function IconButton({ icon: Icon, label, className, type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        'grid size-10 cursor-pointer place-items-center rounded-xl text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink',
        className,
      )}
      {...props}
    >
      <Icon aria-hidden className="size-5" />
    </button>
  )
}
