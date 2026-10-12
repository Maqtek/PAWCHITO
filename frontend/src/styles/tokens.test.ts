/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// ?raw в Vitest отдаёт CSS пустой строкой, а import.meta.url под jsdom не file:// — читаем от корня проекта.
const css = readFileSync(resolve(process.cwd(), 'src/styles/index.css'), 'utf8')

function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6});`, 'i').exec(css)
  if (!match) throw new Error(`Нет токена --color-${name}`)
  return match[1]
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

describe('токены: контраст по WCAG AA', () => {
  it.each(['bg', 'surface', 'surface-muted', 'sand', 'primary-soft'])('ink-muted на %s — не ниже 4.5:1', (background) => {
    expect(contrast(token('ink-muted'), token(background))).toBeGreaterThanOrEqual(4.5)
  })

  it('граница полей line-strong на белом — не ниже 3:1', () => {
    expect(contrast(token('line-strong'), token('surface'))).toBeGreaterThanOrEqual(3)
  })

  it('белый текст на coral-ink — не ниже 4.5:1', () => {
    expect(contrast('#ffffff', token('coral-ink'))).toBeGreaterThanOrEqual(4.5)
  })

  it('кольцо фокуса — primary без прозрачности, не ниже 3:1 к фону', () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline-primary;/)
    expect(contrast(token('primary'), token('bg'))).toBeGreaterThanOrEqual(3)
  })
})
