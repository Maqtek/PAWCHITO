import { api } from '../../api/client'
import { errorMessage } from '../../api/error-messages'
import { ApiError } from '../../api/errors'
import { authLimits } from '../../api/limits'
import { unwrap } from '../../api/queries'
import { reauthenticateWith } from '../../api/session'
import { Button, FormAlert, PasswordField } from '../../components/ui'
import { useForm } from '../../lib/use-form'
import { NewPasswordFields } from './AuthFields'
import { requiredError } from '../../lib/checks'
import { newPasswordErrors } from './checks'

export interface ChangePasswordFormProps {
  /** «Текущий пароль» в профиле, «Временный пароль» при обязательной смене. */
  currentLabel: string
  onSuccess: () => void
  /** Есть — рядом с отправкой кнопка «Отмена» (в модалке профиля), нет — кнопка отправки во всю ширину. */
  onCancel?: () => void
}

/** Смена пароля: сервер выдаёт новый токен и cookie, остальные сессии завершает. */
export function ChangePasswordForm({ currentLabel, onSuccess, onCancel }: ChangePasswordFormProps) {
  const form = useForm({
    initial: { current_password: '', new_password: '', password_repeat: '' },
    validate: (values) => {
      const passwords = newPasswordErrors(values.new_password, values.password_repeat)
      return {
        current_password: requiredError(values.current_password, { trim: false }),
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
      <NewPasswordFields password={form.field('new_password')} repeat={form.field('password_repeat')} />
      <FormAlert message={form.formError} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {/* Не FormActions: там отмена ждёт ответа, а окно смены пароля закрывается и во время запроса — ответ дойдёт до профиля. */}
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Отмена
          </Button>
        )}
        {/* Не disabled: с выключенной кнопки фокус уходит на body. Повторную отправку отсекает useForm. */}
        <Button type="submit" fullWidth={!onCancel} aria-disabled={form.submitting}>
          {form.submitting ? 'Сохраняем…' : 'Сменить пароль'}
        </Button>
      </div>
    </form>
  )
}
