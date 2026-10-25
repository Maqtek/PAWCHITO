const PLAIN = /^[A-Z0-9]{16}$/
const FORMATTED = /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/
// Пробелы, дефисы и тире всех видов, мягкий перенос, символы нулевой ширины: так код приходит из заметок и мессенджеров.
const SEPARATORS = /[\s\-\u2010-\u2015\u2212\u00AD\u200B-\u200D\u2060\uFEFF]/g

/**
 * Код, как его ввёл человек, → как ждёт сервер: регистр, разделители и полноширинные символы не важны.
 * 16 букв и цифр — XXXX-XXXX-XXXX-XXXX; иначе очищенная строка, её отклонит isRecoveryCode.
 * Кириллические буквы-двойники латиницей не считаем.
 */
export function normalizeRecoveryCode(input: string): string {
  const code = input.normalize('NFKC').replace(SEPARATORS, '').toUpperCase()
  return PLAIN.test(code) ? [code.slice(0, 4), code.slice(4, 8), code.slice(8, 12), code.slice(12)].join('-') : code
}

/** Формат XXXX-XXXX-XXXX-XXXX из A–Z0–9. */
export function isRecoveryCode(code: string): boolean {
  return FORMATTED.test(code)
}
