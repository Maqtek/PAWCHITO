import { Copy } from 'lucide-react'
import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { Button, CheckboxField } from '../../components/ui'
import { cn } from '../../lib/cn'

type CopyState = 'idle' | 'copied' | 'manual'

const copyMessages: Record<CopyState, string> = {
  idle: '',
  copied: 'Код скопирован',
  manual: 'Выделите код и скопируйте вручную',
}

interface RecoveryCodeScreenProps {
  code: string
  onContinue: () => void
  /** h2 на экранах авторизации, h3 в модалке профиля со своим h2. */
  headingLevel?: 'h2' | 'h3'
  continueLabel?: string
  /** Например, mt-0 в модалке: верхний отступ рассчитан на карточку входа. */
  className?: string
}

/** Код восстановления показывается один раз: копирование, подтверждение и предупреждение при уходе со страницы. */
export function RecoveryCodeScreen({
  code,
  onContinue,
  headingLevel: Heading = 'h2',
  continueLabel = 'Продолжить',
  className,
}: RecoveryCodeScreenProps) {
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const codeRef = useRef<HTMLParagraphElement>(null)
  const [saved, setSaved] = useState(false)
  const [copyState, setCopyState] = useState<CopyState>('idle')

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  // Уйти, не сохранив код, — потерять доступ: браузер переспросит при перезагрузке и закрытии вкладки.
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
      await navigator.clipboard.writeText(code)
      setCopyState('copied')
    } catch {
      // Буфер обмена недоступен — выделяем код, чтобы скопировать вручную.
      const node = codeRef.current
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
        Сохраните код восстановления
      </Heading>
      {/* Между дефисом и буквой браузер строку не переносит — wbr разрешает перенос только между группами. */}
      <p
        ref={codeRef}
        className="rounded-xl border border-line bg-surface-muted px-4 py-3 text-center font-mono text-lg font-bold tracking-wider sm:text-2xl"
      >
        {code.split('-').map((group, index) => (
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
      <p className="text-sm text-ink-muted">
        Код нужен, если забудете пароль. Без кода и пароля доступ к аккаунту не восстановить: администратор не
        сбрасывает пароли владельцев.
      </p>
      <CheckboxField
        label="Код сохранён в надёжном месте"
        checked={saved}
        onChange={(event) => setSaved(event.target.checked)}
      />
      <Button fullWidth disabled={!saved} onClick={onContinue}>
        {continueLabel}
      </Button>
    </section>
  )
}
