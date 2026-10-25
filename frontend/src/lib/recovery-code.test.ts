import { describe, expect, it } from 'vitest'
import { isRecoveryCode, normalizeRecoveryCode } from './recovery-code'

const CODE = 'K7QM-2XPA-9RTD-4WNB'

describe('normalizeRecoveryCode', () => {
  it.each([
    ['K7QM-2XPA-9RTD-4WNB', CODE],
    ['k7qm-2xpa-9rtd-4wnb', CODE],
    ['  K7QM 2XPA 9RTD 4WNB ', CODE],
    ['k7qm2xpa9rtd4wnb', CODE],
    ['K7QM2XPA-9RTD-4WNB', CODE],
    ['K7-QM-2X-PA-9R-TD-4W-NB', CODE],
    ['abc', 'ABC'],
    ['a-b c', 'ABC'],
    ['', ''],
  ])('«%s» → «%s»', (input, expected) => {
    expect(normalizeRecoveryCode(input)).toBe(expected)
  })

  // Невидимые и похожие на дефис символы — только escape-последовательностями.
  it.each([
    ['короткое тире', 'K7QM\u20132XPA\u20139RTD\u20134WNB'],
    ['длинное тире', 'K7QM\u20142XPA\u20149RTD\u20144WNB'],
    ['дефис, неразрывный дефис и минус', 'K7QM\u20102XPA\u20119RTD\u22124WNB'],
    ['мягкий перенос', 'K7QM\u00AD2XPA\u00AD9RTD\u00AD4WNB'],
    ['пробел нулевой ширины внутри', 'K7QM\u200B2XPA9R\u200BTD-4WNB'],
    ['соединители нулевой ширины, WORD JOINER и BOM', '\uFEFFK7QM\u200C2XPA\u200D9RTD\u20604WNB'],
    ['неразрывные пробелы', 'K7QM\u00A02XPA\u202F9RTD\u00A04WNB'],
    ['полноширинные буквы, цифры и дефис', '\uFF4B\uFF17\uFF51\uFF4D\uFF0D\uFF12\uFF58\uFF50\uFF41\uFF0D\uFF19\uFF52\uFF54\uFF44\uFF0D\uFF14\uFF57\uFF4E\uFF42'],
  ])('%s → код', (_, input) => {
    expect(normalizeRecoveryCode(input)).toBe(CODE)
  })

  it.each([
    ['17 символов', 'K7QM-2XPA-9RTD-4WNBX'],
    ['15 символов', 'K7QM-2XPA-9RTD-4WN'],
    ['кириллическая К вместо латинской K', '\u041A7QM-2XPA-9RTD-4WNB'],
  ])('%s — после нормализации не код', (_, input) => {
    expect(isRecoveryCode(normalizeRecoveryCode(input))).toBe(false)
  })
})

describe('isRecoveryCode', () => {
  it.each([
    ['K7QM-2XPA-9RTD-4WNB', true],
    ['K7QM2XPA9RTD4WNB', false],
    ['K7QM-2XPA-9RTD-4WN', false],
    ['k7qm-2xpa-9rtd-4wnb', false],
    ['K7QM-2XPA-9RTD-4WN!', false],
  ])('%s → %s', (code, expected) => {
    expect(isRecoveryCode(code)).toBe(expected)
  })
})
