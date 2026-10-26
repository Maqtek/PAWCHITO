import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { errorMessage, type ErrorContext } from '../api/error-messages'
import { ApiError } from '../api/errors'

type FormValues = Record<string, string>

export type FieldErrors<V extends FormValues> = Partial<Record<keyof V, ReactNode>>

/** Что показать после ошибки отправки: ошибки полей и текст над кнопкой. */
export interface FormFailure<V extends FormValues> {
  fields?: FieldErrors<V>
  form?: string
}

interface UseFormOptions<V extends FormValues> {
  initial: V
  /** Ошибки полей; у верного поля — undefined или ключа нет. */
  validate: (values: V) => Partial<Record<keyof V, string | undefined>>
  onSubmit: (values: V) => Promise<void>
  /** Где форма: от этого зависит текст ошибки сервера. */
  context?: ErrorContext
  /** Особые ошибки (например, 409 у поля email); undefined — разбор по умолчанию. */
  onError?: (error: unknown, values: V) => FormFailure<V> | undefined
  /**
   * Запрос идёт (true перед onSubmit, false после): окно с формой нельзя закрыть, иначе изменение применится,
   * а ответ или ошибку показать будет некому.
   */
  onBusyChange?: (busy: boolean) => void
}

export function focusField(form: HTMLFormElement, name: string): void {
  const element = form.elements.namedItem(name)
  if (element instanceof HTMLElement) element.focus()
}

/**
 * Форма без зависимостей: ошибки полей появляются при отправке и дальше пересчитываются при вводе,
 * фокус — на первое неверное поле, 422 раскладывается по полям, повторная отправка во время запроса игнорируется.
 */
export function useForm<V extends FormValues>({
  initial,
  validate,
  onSubmit,
  context = 'default',
  onError,
  onBusyChange,
}: UseFormOptions<V>) {
  const [values, setValues] = useState(initial)
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState<FieldErrors<V>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inFlight = useRef(false)
  const names = Object.keys(initial) as (keyof V & string)[]

  const clientErrors: Partial<Record<keyof V, string | undefined>> = submitted ? validate(values) : {}

  function setValue(name: keyof V & string, value: string): void {
    setValues((current) => ({ ...current, [name]: value }))
    // Ошибка сервера относилась к старому значению — убираем её при правке поля.
    setServerErrors((current) => {
      if (current[name] === undefined) return current
      const next = { ...current }
      delete next[name]
      return next
    })
  }

  function field(name: keyof V & string) {
    return {
      name,
      value: values[name],
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setValue(name, event.target.value),
      error: clientErrors[name] ?? serverErrors[name],
    }
  }

  function defaultFailure(error: unknown): FormFailure<V> {
    const form = errorMessage(error, context)
    if (!(error instanceof ApiError) || error.status !== 422) return { form }
    const fields: FieldErrors<V> = {}
    for (const name of names) {
      if (error.fieldErrors[name]) fields[name] = error.fieldErrors[name]
    }
    return { fields, form }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (inFlight.current) return
    const form = event.currentTarget
    setSubmitted(true)
    setFormError(null)
    const found = validate(values)
    const firstInvalid = names.find((name) => found[name])
    if (firstInvalid) {
      focusField(form, firstInvalid)
      return
    }
    inFlight.current = true
    // Ошибки сервера относились к прошлой отправке — новый ответ разложит свои.
    setServerErrors({})
    setSubmitting(true)
    onBusyChange?.(true)
    try {
      await onSubmit(values)
    } catch (error) {
      const failure = onError?.(error, values) ?? defaultFailure(error)
      setServerErrors(failure.fields ?? {})
      setFormError(failure.form ?? null)
      const firstServerError = names.find((name) => failure.fields?.[name])
      if (firstServerError) focusField(form, firstServerError)
    } finally {
      inFlight.current = false
      setSubmitting(false)
      onBusyChange?.(false)
    }
  }

  return { values, setValue, field, formError, submitting, handleSubmit }
}
