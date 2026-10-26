import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { meQuery } from '../../api/queries'
import { buttonClass, PageStatus } from '../../components/ui'
import { PetSummary } from '../../features/home/PetSummary'
import { PetRequired } from '../../features/pets/PetRequired'
import { usePetStatus } from '../../features/pets/usePetStatus'
import { useSelectedPet } from '../../features/pets/useSelectedPet'
import { PageHeader } from '../../layouts/PageHeader'
import { displayName, formatDayDate, greeting } from '../../lib/format'

export function HomePage() {
  const { data: user } = useQuery(meQuery)
  const { pet } = useSelectedPet()
  // Время фиксируется при открытии страницы: рендер должен быть чистым.
  const [now] = useState(() => new Date())
  const [status, showStatus] = usePetStatus(pet?.id)

  return (
    <>
      <PageHeader
        eyebrow={formatDayDate(now)}
        title={user ? `${greeting(now)}, ${displayName(user)}` : greeting(now)}
        documentTitle="Главная"
        actions={
          <Link to="/pets" className={buttonClass()}>
            <Plus aria-hidden className="size-4" />
            Добавить питомца
          </Link>
        }
      />
      <PageStatus message={status} />
      {/*
        Ссылка «Добавить питомца» — в шапке страницы.
        key: при смене питомца сводка начинает с чистого листа — без чужих открытых окон.
      */}
      <PetRequired
        emptyTitle="Добавьте первого питомца"
        description="Здесь появятся его карточка, статус ухода, дела на сегодня и ближайшая запись к врачу."
        hideAddLink
      >
        {(pet) => <PetSummary key={pet.id} pet={pet} now={now} onStatus={showStatus} />}
      </PetRequired>
    </>
  )
}
