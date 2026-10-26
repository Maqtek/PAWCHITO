import type { Pet } from '../../api/schema'
import { cn } from '../../lib/cn'
import { PetIllustration } from '../illustrations/PetIllustration'

/** Размер и скругление — одинаковые у фото и у иллюстрации; в карточке питомца на узком экране — меньше. */
const sizeClass = {
  md: 'size-16 rounded-2xl',
  lg: 'size-20 rounded-3xl sm:size-28',
} as const

interface PetImageProps {
  pet: Pick<Pet, 'name' | 'species' | 'photo_url'>
  /** md — в списке питомцев, lg — в карточке питомца. */
  size: keyof typeof sizeClass
}

/** Фото питомца от клиники, без фото — иллюстрация по виду (БП §6.4). */
export function PetImage({ pet, size }: PetImageProps) {
  if (!pet.photo_url) {
    return <PetIllustration species={pet.species} name={pet.name} size={size} className={sizeClass[size]} />
  }
  return <img src={pet.photo_url} alt={pet.name} className={cn('shrink-0 object-cover', sizeClass[size])} />
}
