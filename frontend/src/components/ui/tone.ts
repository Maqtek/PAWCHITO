import type { Tone } from '../../lib/labels'

/** Пастельный фон + тёмный текст той же гаммы. */
export const toneSoftClass: Record<Tone, string> = {
  mint: 'bg-mint text-mint-ink',
  butter: 'bg-butter text-butter-ink',
  blush: 'bg-blush text-blush-ink',
  sky: 'bg-sky text-sky-ink',
  lilac: 'bg-lilac text-lilac-ink',
  coral: 'bg-coral-ink text-white',
  neutral: 'border border-line bg-surface-muted text-ink-muted',
}

/** Только цвет текста гаммы — для подписей статусов. */
export const toneInkClass: Record<Tone, string> = {
  mint: 'text-mint-ink',
  butter: 'text-butter-ink',
  blush: 'text-blush-ink',
  sky: 'text-sky-ink',
  lilac: 'text-lilac-ink',
  coral: 'text-coral-ink',
  neutral: 'text-ink-muted',
}
