import { PawPrint } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Pet } from '../../api/schema'
import { buttonClass, EmptyState, LoadError, Spinner } from '../../components/ui'
import { useSelectedPet } from './useSelectedPet'

interface PetRequiredProps {
  /** Пояснение, если питомцев нет: зачем разделу питомец. */
  description: string
  /** Заголовок, если питомцев нет. */
  emptyTitle?: string
  /** Без ссылки «Добавить питомца» — когда она уже есть в шапке страницы. */
  hideAddLink?: boolean
  /** Раздел выбранного питомца. */
  children: (pet: Pet) => ReactNode
}

/**
 * Раздел, которому нужен выбранный питомец: пока питомцы загружаются — спиннер, не загрузились — ошибка
 * с «Повторить», питомцев нет — приглашение добавить.
 */
export function PetRequired({
  description,
  emptyTitle = 'Сначала добавьте питомца',
  hideAddLink = false,
  children,
}: PetRequiredProps) {
  const { pet, isPending, isError, refetch } = useSelectedPet()

  if (isPending) return <Spinner label="Загружаем питомцев" />
  if (!pet && isError) return <LoadError title="Не удалось загрузить питомцев" onRetry={() => void refetch()} />
  if (!pet) {
    return (
      <EmptyState
        icon={PawPrint}
        title={emptyTitle}
        description={description}
        action={
          !hideAddLink && (
            <Link to="/pets" className={buttonClass()}>
              Добавить питомца
            </Link>
          )
        }
      />
    )
  }
  return children(pet)
}
