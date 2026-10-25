import { Eye, EyeOff } from 'lucide-react'
import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '../../lib/cn'

const controlClass =
  'w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink transition-colors placeholder:text-ink-muted hover:border-primary-line focus-visible:border-primary aria-[invalid=true]:border-coral-ink'

interface FieldOwnProps {
  label: string
  hint?: string
  error?: ReactNode
}

function useField({ hint, error }: Pick<FieldOwnProps, 'hint' | 'error'>) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  return {
    id,
    hintId,
    errorId,
    describedBy: [errorId, hintId].filter(Boolean).join(' ') || undefined,
    invalid: error ? true : undefined,
  }
}

interface FieldFrameProps extends FieldOwnProps {
  id: string
  hintId?: string
  errorId?: string
  children: ReactNode
}

function FieldFrame({ id, label, hint, hintId, error, errorId, children }: FieldFrameProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-ink">
        {label}
      </label>
      {children}
      {error && (
        <p id={errorId} className="text-xs font-bold text-coral-ink">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  )
}

export function TextField({ label, hint, error, className, ...props }: FieldOwnProps & InputHTMLAttributes<HTMLInputElement>) {
  const field = useField({ hint, error })
  return (
    <FieldFrame id={field.id} label={label} hint={hint} hintId={field.hintId} error={error} errorId={field.errorId}>
      <input
        id={field.id}
        aria-invalid={field.invalid}
        aria-describedby={field.describedBy}
        className={cn(controlClass, className)}
        {...props}
      />
    </FieldFrame>
  )
}

/** Поле пароля с кнопкой «Показать пароль»: подпись постоянная, состояние — aria-pressed. */
export function PasswordField({
  label,
  hint,
  error,
  className,
  ...props
}: FieldOwnProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const field = useField({ hint, error })
  const [visible, setVisible] = useState(false)
  return (
    <FieldFrame id={field.id} label={label} hint={hint} hintId={field.hintId} error={error} errorId={field.errorId}>
      <div className="relative">
        <input
          id={field.id}
          type={visible ? 'text' : 'password'}
          aria-invalid={field.invalid}
          aria-describedby={field.describedBy}
          // Свой глаз Edge рисовался бы рядом с нашей кнопкой.
          className={cn(controlClass, 'pr-11 [&::-ms-reveal]:hidden', className)}
          {...props}
        />
        <button
          type="button"
          aria-label="Показать пароль"
          aria-pressed={visible}
          disabled={props.disabled}
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 grid w-11 cursor-pointer place-items-center rounded-r-xl text-ink-muted transition-colors hover:text-ink"
        >
          {visible ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
        </button>
      </div>
    </FieldFrame>
  )
}

/** Чекбокс с подписью справа; клик по подписи переключает его. */
export function CheckboxField({
  label,
  className,
  ...props
}: { label: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const id = useId()
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <input id={id} type="checkbox" className="mt-0.5 size-5 shrink-0 cursor-pointer accent-primary" {...props} />
      <label htmlFor={id} className="cursor-pointer text-sm font-bold text-ink">
        {label}
      </label>
    </div>
  )
}

export function TextareaField({
  label,
  hint,
  error,
  className,
  ...props
}: FieldOwnProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const field = useField({ hint, error })
  return (
    <FieldFrame id={field.id} label={label} hint={hint} hintId={field.hintId} error={error} errorId={field.errorId}>
      <textarea
        id={field.id}
        aria-invalid={field.invalid}
        aria-describedby={field.describedBy}
        className={cn(controlClass, 'min-h-24 resize-y', className)}
        {...props}
      />
    </FieldFrame>
  )
}

export interface SelectOption {
  value: string
  label: string
}

export function SelectField({
  label,
  hint,
  error,
  options,
  placeholder,
  className,
  ...props
}: FieldOwnProps & SelectHTMLAttributes<HTMLSelectElement> & { options: SelectOption[]; placeholder?: string }) {
  const field = useField({ hint, error })
  return (
    <FieldFrame id={field.id} label={label} hint={hint} hintId={field.hintId} error={error} errorId={field.errorId}>
      <select
        id={field.id}
        aria-invalid={field.invalid}
        aria-describedby={field.describedBy}
        className={cn(controlClass, className)}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  )
}
