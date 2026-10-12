const TIME_ZONE = 'Europe/Moscow'
const LOCALE = 'ru-RU'

type PluralForms = readonly [one: string, few: string, many: string]

/** Форма слова для числа: 1 год, 2 года, 5 лет. */
export function pluralize(count: number, [one, few, many]: PluralForms): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

function moscowParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') }
}

/** «среда, 17 июня» по московскому времени. */
export function formatDayDate(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date)
}

/** «20:00» по московскому времени. */
export function formatTime(value: string | Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

/** Приветствие по времени суток в Москве. */
export function greeting(date: Date): string {
  const { hour } = moscowParts(date)
  if (hour >= 5 && hour < 12) return 'Доброе утро'
  if (hour >= 12 && hour < 17) return 'Добрый день'
  if (hour >= 17 && hour < 23) return 'Добрый вечер'
  return 'Доброй ночи'
}

/** Возраст по дате рождения «YYYY-MM-DD»: «4 года», «7 месяцев», «меньше месяца». */
export function formatAge(birthDate: string, today: Date): string {
  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number)
  const now = moscowParts(today)
  const months = (now.year - birthYear) * 12 + (now.month - birthMonth) - (now.day < birthDay ? 1 : 0)
  if (months < 1) return 'меньше месяца'
  if (months < 12) return `${months} ${pluralize(months, ['месяц', 'месяца', 'месяцев'])}`
  const years = Math.floor(months / 12)
  return `${years} ${pluralize(years, ['год', 'года', 'лет'])}`
}

/** Инициалы для аватара: «Анна Смирнова» → «АС», «ВетДоктор» → «ВЕ». */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
