import { describe, expect, it } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('склеивает классы и убирает пустые', () => {
    expect(cn('px-2', false, undefined, 'text-ink')).toBe('px-2 text-ink')
  })

  it('последний конфликтующий класс побеждает', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
    expect(cn('bg-mint text-mint-ink', 'bg-blush')).toBe('text-mint-ink bg-blush')
  })
})
