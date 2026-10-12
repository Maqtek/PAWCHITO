import type { KeyboardEvent } from 'react'
import { cn } from '../../lib/cn'

export interface TabItem<T extends string> {
  id: T
  label: string
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[]
  value: T
  onChange: (id: T) => void
  label: string
}

export function Tabs<T extends string>({ items, value, onChange, label }: TabsProps<T>) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    const index = items.findIndex((item) => item.id === value)
    const step = event.key === 'ArrowRight' ? 1 : items.length - 1
    const next = items[(index + step) % items.length]
    onChange(next.id)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab-id="${next.id}"]`)?.focus()
  }

  return (
    <div role="tablist" aria-label={label} onKeyDown={handleKeyDown} className="inline-flex flex-wrap gap-2">
      {items.map((item) => {
        const selected = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            data-tab-id={item.id}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              'h-9 cursor-pointer rounded-full border px-4 text-sm font-bold transition-colors',
              selected ? 'border-primary bg-primary text-white' : 'border-line bg-surface text-ink-muted hover:text-ink',
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
