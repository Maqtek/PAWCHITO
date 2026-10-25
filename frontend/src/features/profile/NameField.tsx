import { useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { api } from '../../api/client'
import { validationMessages } from '../../api/error-messages'
import { authLimits } from '../../api/limits'
import { meQuery, unwrap } from '../../api/queries'
import type { User } from '../../api/schema'
import { REQUEST_TIMEOUT_MS } from '../../api/session'
import { Button, FormAlert, IconButton, TextField } from '../../components/ui'
import { useForm } from '../../lib/use-form'

/** Имя в профиле: текст с карандашом, по нажатию — поле с «Сохранить» и «Отмена». */
export function NameField({ user }: { user: User }) {
  const [editing, setEditing] = useState(false)
  const [status, setStatus] = useState('')
  const editButton = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)

  // После сохранения или отмены фокус возвращается на карандаш, а не теряется вместе с формой.
  useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current = false
      editButton.current?.focus()
    }
  }, [editing])

  function close(message = '') {
    returnFocus.current = true
    setStatus(message)
    setEditing(false)
  }

  return (
    <div>
      {editing ? (
        <NameForm name={user.full_name} onDone={close} />
      ) : (
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-[8rem_1fr] sm:items-center">
          <span className="text-sm text-ink-muted">Имя</span>
          <div className="flex min-w-0 items-center gap-1">
            <span className="min-w-0 font-bold break-words">{user.full_name}</span>
            <IconButton
              ref={editButton}
              icon={Pencil}
              label="Изменить имя"
              onClick={() => {
                setStatus('')
                setEditing(true)
              }}
            />
          </div>
        </div>
      )}
      <p role="status" className="mt-1 text-sm text-ink-muted empty:mt-0">
        {status}
      </p>
    </div>
  )
}

function NameForm({ name, onDone }: { name: string; onDone: (message?: string) => void }) {
  const queryClient = useQueryClient()
  const form = useForm({
    initial: { full_name: name },
    validate: (values) => ({ full_name: values.full_name.trim() ? undefined : validationMessages.required }),
    context: 'profile',
    onSubmit: async ({ full_name }) => {
      const trimmed = full_name.trim()
      if (trimmed === name) {
        onDone()
        return
      }
      // Правка до ответа не закрывается — без таймаута на зависшей сети она ждала бы вечно.
      const user = await unwrap(
        api.PATCH('/users/me', { body: { full_name: trimmed }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
      )
      // Ответ — свежий пользователь: имя сразу и здесь, и в меню, без перезапроса.
      queryClient.setQueryData(meQuery.queryKey, user)
      onDone('Имя сохранено')
    },
  })

  // Запрос не отменить: пока он идёт, правка ждёт ответа, иначе поздний ответ закроет уже новую правку.
  function cancel() {
    if (!form.submitting) onDone()
  }

  function cancelOnEscape(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    cancel()
  }

  return (
    <form noValidate onSubmit={form.handleSubmit} onKeyDown={cancelOnEscape} className="flex flex-col gap-3">
      <TextField
        label="Имя"
        autoComplete="name"
        maxLength={authLimits.fullNameMax}
        autoFocus
        {...form.field('full_name')}
      />
      <FormAlert message={form.formError} />
      <div className="flex gap-2">
        {/* Не disabled: с выключенной кнопки фокус уходит на body. Повторную отправку отсекает useForm. */}
        <Button type="submit" size="sm" aria-disabled={form.submitting}>
          {form.submitting ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        <Button variant="secondary" size="sm" aria-disabled={form.submitting} onClick={cancel}>
          Отмена
        </Button>
      </div>
    </form>
  )
}
