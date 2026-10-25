import { cn } from '../../lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover',
  secondary: 'border border-line bg-surface text-ink hover:bg-surface-muted',
  ghost: 'text-ink-muted hover:bg-primary-soft hover:text-primary',
  danger: 'bg-coral-ink text-white hover:bg-coral-ink/90',
}

const sizeClass: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-sm',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-6 text-base',
}

/** Классы кнопки — и для <button>, и для <Link>, который выглядит как кнопка. */
export function buttonClass({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
}: { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean } = {}): string {
  return cn(
    'inline-flex cursor-pointer items-center justify-center rounded-xl font-bold whitespace-nowrap transition-colors',
    // aria-disabled выглядит так же: им блокируют кнопку отправки, чтобы она не теряла фокус.
    'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
    variantClass[variant],
    sizeClass[size],
    fullWidth && 'w-full',
  )
}

/** Пункт выпадающего меню. */
export const menuItemClass =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-ink transition-colors hover:bg-surface-muted aria-[current=true]:text-primary'

/** Текстовая ссылка в формах: «Забыли пароль?», «Войти». */
export const linkClass = 'font-bold text-primary underline-offset-4 hover:underline focus-visible:underline'
