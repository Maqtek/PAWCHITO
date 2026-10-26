import type { ComponentProps } from 'react'
import { authLimits } from '../../api/limits'
import { PasswordField, TextField } from '../../components/ui'

type EmailFieldProps = Omit<ComponentProps<typeof TextField>, 'label'> & { label?: string }

/** Email: браузер подставит сохранённый адрес, на телефоне — клавиатура с @. */
export function EmailField({ label = 'Email', ...props }: EmailFieldProps) {
  return (
    <TextField label={label} type="email" autoComplete="email" inputMode="email" maxLength={authLimits.emailMax} {...props} />
  )
}

type PasswordInputProps = Omit<ComponentProps<typeof PasswordField>, 'label'>

interface NewPasswordFieldsProps {
  /** «Пароль» при регистрации, «Новый пароль» при восстановлении и смене. */
  label?: string
  password: PasswordInputProps
  repeat: PasswordInputProps
}

/** Новый пароль и повтор: браузер предложит сгенерировать пароль, подсказка — из лимитов (#30). */
export function NewPasswordFields({ label = 'Новый пароль', password, repeat }: NewPasswordFieldsProps) {
  return (
    <>
      <PasswordField
        label={label}
        hint={`Не короче ${authLimits.passwordMin} символов`}
        autoComplete="new-password"
        maxLength={authLimits.passwordMax}
        {...password}
      />
      <PasswordField label="Повтор пароля" autoComplete="new-password" maxLength={authLimits.passwordMax} {...repeat} />
    </>
  )
}
