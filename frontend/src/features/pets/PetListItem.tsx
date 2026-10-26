import { Archive, Check, Pencil } from 'lucide-react'
import { useId } from 'react'
import type { Pet } from '../../api/schema'
import { PetImage } from '../../components/pet/PetImage'
import { Badge, Button } from '../../components/ui'
import { formatAge } from '../../lib/format'
import { sexLabel, speciesLabel } from '../../lib/labels'

interface PetListItemProps {
  pet: Pet
  /** Дата, от которой считается возраст. */
  today: Date
  selected: boolean
  onSelect: () => void
  /** Окна — у страницы: питомец может пропасть из списка, а окно с ответом или ошибкой должно остаться. */
  onEdit: () => void
  onArchive: () => void
}

export function PetListItem({ pet, today, selected, onSelect, onEdit, onArchive }: PetListItemProps) {
  const nameId = useId()
  const meta = [
    speciesLabel[pet.species],
    pet.breed,
    pet.birth_date && formatAge(pet.birth_date, today),
    pet.sex !== 'unknown' && sexLabel[pet.sex],
  ]
    .filter(Boolean)
    .join(' · ')

  // Подпись для скринридера — с кличкой: в списке много одинаковых «Изменить».
  const forPet = <span className="sr-only">, {pet.name}</span>

  return (
    <article aria-labelledby={nameId} className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start gap-4">
        <PetImage pet={pet} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={nameId} className="text-lg font-extrabold break-words">
              {pet.name}
            </h2>
            {selected && (
              <Badge tone="mint" dot>
                Выбран
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm break-words text-ink-muted">{meta}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {/* Выбранный — тот, кого показывают все разделы владельца (БП §2); выбор тот же, что в переключателе. */}
        {!selected && (
          <Button variant="secondary" size="sm" icon={Check} onClick={onSelect}>
            Выбрать{forPet}
          </Button>
        )}
        <Button variant="secondary" size="sm" icon={Pencil} onClick={onEdit}>
          Изменить{forPet}
        </Button>
        <Button variant="secondary" size="sm" icon={Archive} onClick={onArchive}>
          В архив{forPet}
        </Button>
      </div>
    </article>
  )
}
