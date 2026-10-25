import { Copy } from 'lucide-react'
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button, CheckboxField } from '../../components/ui'
import { cn } from '../../lib/cn'

type CopyState = 'idle' | 'copied' | 'manual'

export interface RevealOnceScreenProps {
  secret: string
  heading: string
  note: ReactNode
  /** Подпись отметки, без которой кнопка продолжения неактивна. */
  confirmLabel: string
  copiedText: string
  manualText: string
  continueLabel: string
  onContinue: () => void
  /** h2 на экранах авторизации, h3 в модалке со своим h2. */
  headingLevel?: 'h2' | 'h3'
  /** Например, mt-0 в модалке: верхний отступ рассчитан на карточку входа. */
  className?: string
}

/** Секрет показывается один раз: копирование, подтверждение и предупреждение при уходе со страницы. */
export function RevealOnceScreen({
  secret,
  heading,
  note,
  confirmLabel,
  copiedText,
  manualText,
  continueLabel,
  onContinue,
  headingLevel: Heading = 'h2',
  className,
}: RevealOnceScreenProps) {
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const secretRef = useRef<HTMLParagraphElement>(null)
  const [saved, setSaved] = useState(false)
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const copyMessages: Record<CopyState, string> = { idle: '', copied: copiedText, manual: manualText }

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  // Уйти, не сохранив секрет, — потерять его: браузер переспросит при перезагрузке и закрытии вкладки.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret)
      setCopyState('copied')
    } catch {
      // Буфер обмена недоступен — выделяем секрет, чтобы скопировать вручную.
      const node = secretRef.current
      const selection = window.getSelection()
      if (node && selection) {
        const range = document.createRange()
        range.selectNodeContents(node)
        selection.removeAllRanges()
        selection.addRange(range)
      }
      setCopyState('manual')
    }
  }

  return (
    <section aria-labelledby={headingId} className={cn('mt-6 flex flex-col gap-4', className)}>
      <Heading id={headingId} ref={headingRef} tabIndex={-1} className="text-lg font-extrabold outline-none">
        {heading}
      </Heading>
      {/* Между дефисом и буквой браузер строку не переносит — wbr разрешает перенос только между группами. */}
      <p
        ref={secretRef}
        className="rounded-xl border border-line bg-surface-muted px-4 py-3 text-center font-mono text-lg font-bold tracking-wider sm:text-2xl"
      >
        {secret.split('-').map((group, index) => (
          <Fragment key={index}>
            {index > 0 && (
              <>
                -<wbr />
              </>
            )}
            {group}
          </Fragment>
        ))}
      </p>
      <div className="flex flex-col">
        <Button variant="secondary" icon={Copy} onClick={() => void copy()}>
          Скопировать
        </Button>
        <p role="status" className="mt-2 text-sm text-ink-muted empty:mt-0">
          {copyMessages[copyState]}
        </p>
      </div>
      <p className="text-sm text-ink-muted">{note}</p>
      <CheckboxField label={confirmLabel} checked={saved} onChange={(event) => setSaved(event.target.checked)} />
      <Button fullWidth disabled={!saved} onClick={onContinue}>
        {continueLabel}
      </Button>
    </section>
  )
}
