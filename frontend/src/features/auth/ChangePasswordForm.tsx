import type { ReactNode } from 'react'
import { api } from '../../api/client'
import { errorMessage, validationMessages } from '../../api/error-messages'
import { ApiError } from '../../api/errors'
import { authLimits } from '../../api/limits'
import { unwrap } from '../../api/queries'
import { reauthenticateWith } from '../../api/session'
import { Button, FormAlert, PasswordField } from '../../components/ui'
import { useForm } from '../../lib/use-form'
import { newPasswordErrors } from './checks'

export interface ChangePasswordFormProps {
  /** «Текущий пароль» в профиле, «Временный пароль» при обязательной смене. */
  currentLabel: string
  onSuccess: () => void
  /** Кнопка рядом с отправкой, например «Отмена» в модалке. */
  secondaryAction?: ReactNode
}

/** Смена пароля: сервер выдаёт новый токен и cookie, остальные сессии завершает. */
export function ChangePasswordForm({ currentLabel, onSuccess, secondaryAction }: ChangePasswordFormProps) {
  const form = useForm({
    initial: { current_password: '', new_password: '', password_repeat: '' },
    validate: (values) => {
      const passwords = newPasswordErrors(values.new_password, values.password_repeat)
      return {
        current_password: values.current_password === '' ? validationMessages.required : undefined,
        new_password: passwords.password,
        password_repeat: passwords.repeat,
      }
    },
    context: 'change-password',
    onSubmit: async ({ current_password, new_password }) => {
      await reauthenticateWith((token, signal) =>
        unwrap(
          api.POST('/auth/change-password', {
            body: { current_password, new_password },
            headers: { Authorization: `Bearer ${token}` },
            signal,
          }),
        ),
      )
      onSuccess()
    },
    // Неверный текущий пароль — ошибка поля: фокус сразу туда.
    onError: (error) =>
      error instanceof ApiError && error.status === 400
        ? { fields: { current_password: errorMessage(error, 'change-password') } }
        : undefined,
  })

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
      <PasswordField
        label={currentLabel}
        autoComplete="current-password"
        maxLength={authLimits.passwordMax}
        {...form.field('current_password')}
      />
      <PasswordField
        label="Новый пароль"
        hint="Не короче 8 символов"
        autoComplete="new-password"
        maxLength={authLimits.passwordMax}
        {...form.field('new_password')}
      />
      <PasswordField
        label="Повтор пароля"
        autoComplete="new-password"
        maxLength={authLimits.passwordMax}
        {...form.field('password_repeat')}
      />
      <FormAlert message={form.formError} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {secondaryAction}
        {/* Не disabled: с выключенной кнопки фокус уходит на body. Повторную отправку отсекает useForm. */}
        <Button type="submit" fullWidth={!secondaryAction} aria-disabled={form.submitting}>
          {form.submitting ? 'Сохраняем…' : 'Сменить пароль'}
        </Button>
      </div>
    </form>
  )
}
