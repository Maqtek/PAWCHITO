/** Длина в символах Unicode, как len() в Python. */
export const charCount = (value: string) => [...value].length

/** Управляющие символы U+0000–U+001F и U+007F; в многострочном тексте перевод строки разрешён. */
export function hasControlChars(value: string, { multiline = false }: { multiline?: boolean } = {}): boolean {
  return [...value].some((char) => {
    const code = char.codePointAt(0) ?? 0
    return (code < 0x20 && !(multiline && code === 0x0a)) || code === 0x7f
  })
}

/** Обязательная строка: пробелы по краям не считаются, без управляющих символов. HTML не чистим: экранирует фронт. */
export function textError(
  value: unknown,
  label: string,
  max: number,
  { multiline = false }: { multiline?: boolean } = {},
): string | null {
  if (typeof value !== 'string') return `${label}: ожидается строка`
  const text = value.trim()
  if (text === '') return `${label} не может быть пустым`
  if (charCount(text) > max) return `${label} — не длиннее ${max} символов`
  return hasControlChars(text, { multiline }) ? `${label} содержит недопустимые символы` : null
}

/** Необязательная строка: null и пустая строка — «не указано», пустая хранится как null (normalizeText). */
export function optionalTextError(
  value: unknown,
  label: string,
  max: number,
  { multiline = false }: { multiline?: boolean } = {},
): string | null {
  if (value === null) return null
  if (typeof value !== 'string') return `${label}: ожидается строка`
  const text = value.trim()
  if (charCount(text) > max) return `${label} — не длиннее ${max} символов`
  return hasControlChars(text, { multiline }) ? `${label} содержит недопустимые символы` : null
}

/** Необязательный многострочный текст из textarea (Р-44, Р-45). */
export const multilineTextError = (value: unknown, label: string, max: number) =>
  optionalTextError(value, label, max, { multiline: true })

/** Пустой после обрезки текст хранится как null. */
export function normalizeText(value: string | null | undefined): string | null {
  const text = value?.trim() ?? ''
  return text === '' ? null : text
}
