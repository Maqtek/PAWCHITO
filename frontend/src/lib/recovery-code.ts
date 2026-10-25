const PLAIN = /^[A-Z0-9]{16}$/
const FORMATTED = /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/

/** Код, как его ввёл человек, → как ждёт сервер: без пробелов, заглавными; 16 символов без дефисов — с дефисами. */
export function normalizeRecoveryCode(input: string): string {
  const code = input.replace(/\s+/g, '').toUpperCase()
  return PLAIN.test(code) ? [code.slice(0, 4), code.slice(4, 8), code.slice(8, 12), code.slice(12)].join('-') : code
}

/** Формат XXXX-XXXX-XXXX-XXXX из A–Z0–9. */
export function isRecoveryCode(code: string): boolean {
  return FORMATTED.test(code)
}
