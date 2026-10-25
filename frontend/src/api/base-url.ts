/** Адрес API: тот же origin, в разработке его проксирует Vite. */
export function apiBaseUrl(): string {
  return new URL('/api', window.location.origin).toString()
}
