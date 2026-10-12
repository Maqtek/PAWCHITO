import { Check, ChevronDown, PawPrint } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PetIllustration } from '../components/illustrations/PetIllustration'
import { buttonClass, Dropdown, menuItemClass } from '../components/ui'
import { useSelectedPet } from '../features/pets/useSelectedPet'

export function PetSwitcher() {
  const { pets, pet, select, isPending, isError } = useSelectedPet()

  if (isPending) {
    return <span aria-hidden className="block h-10 w-28 animate-pulse rounded-xl bg-surface-muted" />
  }

  if (isError) return null

  if (!pet) {
    return (
      <Link to="/pets" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
        Добавить питомца
      </Link>
    )
  }

  return (
    <Dropdown
      label={`Питомец: ${pet.name}. Сменить питомца`}
      className="min-w-0"
      button={
        <span className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-surface py-1 pr-3 pl-1 hover:border-primary-line">
          <PetIllustration species={pet.species} size="sm" className="size-8 rounded-lg" />
          <span className="max-w-24 truncate text-sm font-extrabold">{pet.name}</span>
          <ChevronDown aria-hidden className="size-4 text-ink-muted" />
        </span>
      }
    >
      {(close) => (
        <>
          <ul>
            {pets.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={menuItemClass}
                  aria-current={item.id === pet.id ? 'true' : undefined}
                  onClick={() => {
                    select(item.id)
                    close()
                  }}
                >
                  <PetIllustration species={item.species} size="sm" className="size-7 rounded-lg" />
                  {/* Пробел нужен доступному имени: «Кошка Барсик», а не «КошкаБарсик». */}
                  {' '}
                  {item.name}
                  {item.id === pet.id && <Check aria-hidden className="ml-auto size-4 text-primary" />}
                </button>
              </li>
            ))}
          </ul>
          <div className="my-1 border-t border-line" />
          <Link to="/pets" className={menuItemClass} onClick={close}>
            <PawPrint aria-hidden className="size-4" />
            Все питомцы
          </Link>
        </>
      )}
    </Dropdown>
  )
}
