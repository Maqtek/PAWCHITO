import type { Species } from '../../api/schema'
import { cn } from '../../lib/cn'
import { speciesLabel } from '../../lib/labels'

const INK = '#1f2524'

function DogFace() {
  return (
    <g stroke={INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="17" cy="33" rx="7" ry="12" transform="rotate(16 17 33)" fill="#c98f4e" />
      <ellipse cx="47" cy="33" rx="7" ry="12" transform="rotate(-16 47 33)" fill="#c98f4e" />
      <ellipse cx="32" cy="34" rx="15" ry="14" fill="#eabd6a" />
      <ellipse cx="32" cy="41" rx="7.5" ry="5.5" fill="#f7e2b8" />
      <path d="M25 31.5q2.5-2.5 5 0M34 31.5q2.5-2.5 5 0" fill="none" />
      <ellipse cx="32" cy="38.5" rx="2.6" ry="2" fill={INK} />
      <path d="M32 40.5v2M29.5 43.5q2.5 2 5 0" fill="none" />
    </g>
  )
}

function CatFace() {
  return (
    <g stroke={INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.5 27 20 12.5l10 8.5z" fill="#b9c9d1" />
      <path d="M45.5 27 44 12.5l-10 8.5z" fill="#b9c9d1" />
      <ellipse cx="32" cy="34" rx="15" ry="13" fill="#d3dee3" />
      <ellipse cx="26.5" cy="32" rx="1.6" ry="2.3" fill={INK} />
      <ellipse cx="37.5" cy="32" rx="1.6" ry="2.3" fill={INK} />
      <path d="M30.6 37h2.8L32 38.8z" fill="#dd836e" />
      <path d="M32 38.8q-1.6 2.2-3.6 1M32 38.8q1.6 2.2 3.6 1" fill="none" />
      <path d="M22 37.5h-6M22.5 40l-5.5 1.8M42 37.5h6M41.5 40l5.5 1.8" fill="none" strokeWidth={1.2} />
    </g>
  )
}

function PawMark() {
  return (
    <g fill="#345e56">
      <ellipse cx="32" cy="40" rx="10" ry="8.5" />
      <ellipse cx="20" cy="29" rx="4" ry="5" transform="rotate(-20 20 29)" />
      <ellipse cx="27.5" cy="22" rx="4" ry="5.2" />
      <ellipse cx="36.5" cy="22" rx="4" ry="5.2" />
      <ellipse cx="44" cy="29" rx="4" ry="5" transform="rotate(20 44 29)" />
    </g>
  )
}

const backgroundClass: Record<Species, string> = {
  dog: 'bg-butter',
  cat: 'bg-sky',
  other: 'bg-mint',
}

const sizeClass = {
  sm: 'size-10 rounded-xl',
  md: 'size-16 rounded-2xl',
  lg: 'size-28 rounded-3xl',
} as const

export interface PetIllustrationProps {
  species: Species
  name?: string
  size?: keyof typeof sizeClass
  className?: string
}

/** Иллюстрация вместо фото: у питомца фото загружает только клиника (БП §6.4). */
export function PetIllustration({ species, name, size = 'md', className }: PetIllustrationProps) {
  const label = name ? `${speciesLabel[species]} ${name}` : speciesLabel[species]
  return (
    <span
      role="img"
      aria-label={label}
      className={cn('grid shrink-0 place-items-center', backgroundClass[species], sizeClass[size], className)}
    >
      <svg viewBox="0 0 64 64" aria-hidden className="size-[82%]">
        {species === 'dog' ? <DogFace /> : species === 'cat' ? <CatFace /> : <PawMark />}
      </svg>
    </span>
  )
}
