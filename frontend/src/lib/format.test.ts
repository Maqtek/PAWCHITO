import { describe, expect, it } from 'vitest'
import { displayName, formatAge, formatDayDate, formatShortDate, formatTime, greeting, initials, pluralize } from './format'

describe('pluralize', () => {
  const forms = ['год', 'года', 'лет'] as const
  it.each([
    [1, 'год'], [2, 'года'], [4, 'года'], [5, 'лет'], [11, 'лет'],
    [12, 'лет'], [21, 'год'], [22, 'года'], [25, 'лет'], [111, 'лет'],
  ])('%i → %s', (count, word) => {
    expect(pluralize(count, forms)).toBe(word)
  })
})

describe('даты и время по Москве', () => {
  it('день недели и дата', () => {
    // 21:30 UTC 16 июня — в Москве уже 00:30 17 июня, среда
    expect(formatDayDate(new Date('2026-06-16T21:30:00Z'))).toBe('среда, 17 июня')
  })

  it('время в 24-часовом формате', () => {
    expect(formatTime('2026-10-15T07:00:00Z')).toBe('10:00')
    expect(formatTime('2026-10-15T17:05:00Z')).toBe('20:05')
  })

  it.each([
    ['2026-10-12T03:00:00Z', 'Доброе утро'],
    ['2026-10-12T10:00:00Z', 'Добрый день'],
    ['2026-10-12T16:00:00Z', 'Добрый вечер'],
    ['2026-10-11T23:00:00Z', 'Доброй ночи'],
    ['2026-10-12T02:00:00Z', 'Доброе утро'],
    ['2026-10-12T09:00:00Z', 'Добрый день'],
    ['2026-10-12T14:00:00Z', 'Добрый вечер'],
    ['2026-10-12T20:00:00Z', 'Доброй ночи'],
    ['2026-10-11T21:00:00Z', 'Доброй ночи'],
  ])('приветствие для %s', (iso, text) => {
    expect(greeting(new Date(iso))).toBe(text)
  })
})

describe('formatShortDate', () => {
  it('день и месяц словами', () => {
    expect(formatShortDate('2026-10-10T10:40:00+03:00')).toBe('10 октября')
  })

  it('дата считается по Москве, а не по UTC', () => {
    // 21:30 UTC 31 октября — в Москве уже 1 ноября
    expect(formatShortDate('2026-10-31T21:30:00Z')).toBe('1 ноября')
  })

  it('принимает Date', () => {
    expect(formatShortDate(new Date('2026-10-10T07:40:00Z'))).toBe('10 октября')
  })
})

describe('formatAge', () => {
  const today = new Date('2026-10-12T12:00:00Z')
  // Между числом и словом неразрывный пробел: на узкой карточке «4» не отрывается от «года».
  it.each([
    ['2022-05-01', '4\u00A0года'],
    ['2025-10-12', '1\u00A0год'],
    ['2026-03-01', '7\u00A0месяцев'],
    ['2026-10-01', 'меньше месяца'],
    ['2025-10-13', '11\u00A0месяцев'],
  ])('%s → %s', (birthDate, text) => {
    expect(formatAge(birthDate, today)).toBe(text)
  })

  it('возраст считается по московской дате, а не по UTC', () => {
    // 21:30 UTC 31 октября — в Москве уже 1 ноября 00:30
    expect(formatAge('2025-11-01', new Date('2026-10-31T21:30:00Z'))).toBe('1\u00A0год')
  })
})

describe('initials', () => {
  it.each([
    ['Анна Смирнова', 'АС'],
    ['анна смирнова', 'АС'],
    ['Анна Мария Смирнова', 'АМ'],
    ['ВетДоктор', 'ВД'],
    ['  ВетДоктор  ', 'ВД'],
    ['Администратор', 'АД'],
    ['ЗООВЕТ', 'ЗО'],
    ['  ', '?'],
    ['', '?'],
  ])('«%s» → %s', (name, text) => {
    expect(initials(name)).toBe(text)
  })
})

describe('displayName', () => {
  it.each([
    ['Анна Смирнова', 'Анна Смирнова'],
    [null, 'clinic@example.com'],
    ['  ', 'clinic@example.com'],
  ])('full_name %j → %s', (fullName, text) => {
    expect(displayName({ full_name: fullName, email: 'clinic@example.com' })).toBe(text)
  })
})
