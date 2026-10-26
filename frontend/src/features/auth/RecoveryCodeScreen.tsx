import { RevealOnceScreen } from './RevealOnceScreen'

interface RecoveryCodeScreenProps {
  code: string
  onContinue: () => void
  /** h2 на экранах авторизации, h3 в модалке профиля со своим h2. */
  headingLevel?: 'h2' | 'h3'
  continueLabel?: string
  /** Например, mt-0 в модалке: верхний отступ рассчитан на карточку входа. */
  className?: string
}

/** Код восстановления показывается один раз. */
export function RecoveryCodeScreen({ code, continueLabel = 'Продолжить', ...rest }: RecoveryCodeScreenProps) {
  return (
    <RevealOnceScreen
      secret={code}
      heading="Сохраните код восстановления"
      note="Код нужен, если забудете пароль. Без кода и пароля доступ к аккаунту не восстановить: администратор не сбрасывает пароли владельцев."
      confirmLabel="Код сохранён в надёжном месте"
      copiedText="Код скопирован"
      manualText="Выделите код и скопируйте вручную"
      continueLabel={continueLabel}
      {...rest}
    />
  )
}
