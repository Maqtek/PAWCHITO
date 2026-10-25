import { describe, expect, it } from 'vitest'
import { isRecoveryCode, normalizeRecoveryCode } from './recovery-code'

describe('normalizeRecoveryCode', () => {
  it.each([
    ['K7QM-2XPA-9RTD-4WNB', 'K7QM-2XPA-9RTD-4WNB'],
    ['k7qm-2xpa-9rtd-4wnb', 'K7QM-2XPA-9RTD-4WNB'],
    ['  K7QM 2XPA 9RTD 4WNB ', 'K7QM-2XPA-9RTD-4WNB'],
    ['k7qm2xpa9rtd4wnb', 'K7QM-2XPA-9RTD-4WNB'],
    ['abc', 'ABC'],
    ['', ''],
  ])('«%s» → «%s»', (input, expected) => {
    expect(normalizeRecoveryCode(input)).toBe(expected)
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
