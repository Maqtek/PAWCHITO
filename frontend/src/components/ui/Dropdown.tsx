import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
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

/**
 * Вызывает render-prop из пропса: onClose читает ref только в обработчике события,
 * а вызов children(...) прямо в рендере Dropdown линтер react-hooks/refs принимает за чтение ref при рендере.
 */
function PanelContent({ render, onClose }: { render: DropdownProps['children']; onClose: () => void }) {
  return render(onClose)
}

export function Dropdown({ label, button, children, align = 'end', placement = 'bottom', className }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  // Закрытие по Esc или выбором пункта: если фокус был внутри меню, он вернётся на кнопку,
  // иначе сфокусированный пункт исчезнет и фокус упадёт на <body>.
  const closeAndRestoreFocus = useCallback(() => {
    if (rootRef.current?.contains(document.activeElement)) triggerRef.current?.focus()
    setOpen(false)
  }, [])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      // Клик снаружи закрывает меню, не трогая фокус: он уходит туда, куда кликнули.
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeAndRestoreFocus()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, closeAndRestoreFocus])

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
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
            'absolute z-30 max-h-[70dvh] min-w-56 overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-lg',
            align === 'end' ? 'right-0' : 'left-0',
            placement === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2',
          )}
        >
          <PanelContent render={children} onClose={closeAndRestoreFocus} />
        </div>
      )}
    </div>
  )
}
