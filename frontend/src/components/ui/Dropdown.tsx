import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface DropdownProps {
  /** Доступное имя кнопки-триггера. */
  label: string
  button: ReactNode
  children: (close: () => void) => ReactNode
  align?: 'start' | 'end'
  placement?: 'bottom' | 'top'
  className?: string
}

export function Dropdown({ label, button, children, align = 'end', placement = 'bottom', className }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="block w-full cursor-pointer rounded-xl text-left"
      >
        {button}
      </button>
      {open && (
        <div
          id={panelId}
          className={cn(
            'absolute z-30 min-w-56 rounded-2xl border border-line bg-surface p-1.5 shadow-lg',
            align === 'end' ? 'right-0' : 'left-0',
            placement === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2',
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
