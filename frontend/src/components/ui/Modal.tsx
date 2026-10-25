import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { IconButton } from './Button'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  /** false — закрывается только своими кнопками: нет крестика, Esc и клик по фону не закрывают. */
  dismissible?: boolean
}

/** Нативный <dialog>: фокус внутри окна и закрытие по Esc даёт браузер. */
export function Modal({ open, onClose, title, children, footer, dismissible = true }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        if (dismissible) onClose()
      }}
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose()
      }}
      // Нативное close, не пропс onClose: браузер закрывает окно сам при повторном Esc, родитель об этом не узнает.
      onClose={() => {
        if (!dismissible && open) ref.current?.showModal()
      }}
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-card border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/30"
    >
      <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
        <h2 id={titleId} className="text-lg font-extrabold">
          {title}
        </h2>
        {dismissible && <IconButton icon={X} label="Закрыть" onClick={onClose} />}
      </div>
      <div className="px-6 py-5">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
    </dialog>
  )
}
