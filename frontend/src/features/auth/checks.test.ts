import { describe, expect, it } from 'vitest'
import { emailError, newPasswordErrors } from './checks'

describe('emailError', () => {
  it.each([
    ['', 'Заполните поле'],
    ['   ', 'Заполните поле'],
    ['owner', 'Введите email в формате name@example.com'],
    ['owner@example', 'Введите email в формате name@example.com'],
    [' owner@example.com ', undefined],
  ])('«%s» → %s', (email, expected) => {
    expect(emailError(email)).toBe(expected)
  })
})

describe('newPasswordErrors', () => {
  it('пустые поля', () => {
    expect(newPasswordErrors('', '')).toEqual({ password: 'Заполните поле', repeat: 'Заполните поле' })
  })

  it('7 символов — коротко, 8 — достаточно', () => {
    expect(newPasswordErrors('1234567', '1234567').password).toBe('Пароль — не короче 8 символов')
    expect(newPasswordErrors('12345678', '12345678')).toEqual({ password: undefined, repeat: undefined })
  })

  it('длина в символах Unicode: 8 эмодзи — достаточно', () => {
    const password = '😀'.repeat(8)
    expect(newPasswordErrors(password, password).password).toBeUndefined()
  })

  it('длина в символах Unicode: 7 эмодзи — коротко, хотя .length равна 14', () => {
    const password = '😀'.repeat(7)
    expect(password).toHaveLength(14)
    expect(newPasswordErrors(password, password).password).toBe('Пароль — не короче 8 символов')
  })

  it('повтор не совпадает', () => {
    expect(newPasswordErrors('12345678', '12345679').repeat).toBe('Пароли не совпадают')
  })

  it('пустой повтор при заполненном пароле — ошибка у повтора', () => {
    expect(newPasswordErrors('12345678', '')).toEqual({ password: undefined, repeat: 'Заполните поле' })
  })
})
