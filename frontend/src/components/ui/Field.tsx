import {
  useId,
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
  error?: string
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
