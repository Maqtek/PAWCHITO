import { describe, expect, it } from 'vitest'
import {
  formatPhone,
  formatSchedule,
  formatWorkDays,
  halfHourOptions,
  normalizePhone,
  parseWorkDays,
  serializeWorkDays,
} from './clinic-format'

describe('formatWorkDays', () => {
  it('все дни — «Ежедневно», подряд от трёх — диапазон, иначе — список', () => {
    expect(formatWorkDays([1, 2, 3, 4, 5, 6, 7])).toBe('Ежедневно')
    expect(formatWorkDays([1, 2, 3, 4, 5, 6])).toBe('Пн–Сб')
    expect(formatWorkDays([5, 5, 4, 3])).toBe('Ср–Пт')
    expect(formatWorkDays([6, 1, 3])).toBe('Пн, Ср, Сб')
    expect(formatWorkDays([1, 2])).toBe('Пн, Вт')
  })

  it('не день — дробное и вне 1–7 — пропускается', () => {
    expect(formatWorkDays([1.5, 2])).toBe('Вт')
    expect(formatWorkDays([0, 3, 8])).toBe('Ср')
  })
})

describe('formatSchedule', () => {
  it('дни и часы', () => {
    expect(formatSchedule({ work_days: [1, 2, 3, 4, 5, 6], opens_at: '09:00', closes_at: '20:00' })).toBe(
      'Пн–Сб, 09:00–20:00',
    )
  })
})

describe('телефон', () => {
  it('нормализация: пробелы, скобки, дефисы; 8 и 7 в начале — +7', () => {
    expect(normalizePhone('8 (999) 000-00-00')).toBe('+79990000000')
    expect(normalizePhone('+7 999 000 00 00')).toBe('+79990000000')
    expect(normalizePhone('79990000000')).toBe('+79990000000')
    expect(normalizePhone('12345')).toBe('12345')
  })

  it('вид: +7 999 000-00-00; не номер — как есть', () => {
    expect(formatPhone('+79990000000')).toBe('+7 999 000-00-00')
    expect(formatPhone('abc')).toBe('abc')
  })
})

describe('часы и дни формы', () => {
  it('48 значений с шагом 30 минут', () => {
    expect(halfHourOptions).toHaveLength(48)
    expect(halfHourOptions.slice(0, 2)).toEqual(['00:00', '00:30'])
    expect(halfHourOptions[47]).toBe('23:30')
  })

  it('дни строкой: разбор отбрасывает мусор, запись — без повторов и по порядку', () => {
    expect(parseWorkDays('3,1,,9,x')).toEqual([1, 3])
    expect(serializeWorkDays([3, 1, 3])).toBe('1,3')
    expect(parseWorkDays('')).toEqual([])
  })
})
