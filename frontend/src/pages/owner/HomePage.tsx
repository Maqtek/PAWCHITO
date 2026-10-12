import { useQuery } from '@tanstack/react-query'
import { Inbox, PawPrint, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { meQuery } from '../../api/queries'
import { PetCard } from '../../components/pet/PetCard'
import { buttonClass, EmptyState, Eyebrow, Spinner } from '../../components/ui'
import { useSelectedPet } from '../../features/pets/useSelectedPet'
import { PageHeader } from '../../layouts/PageHeader'
import { formatDayDate, greeting } from '../../lib/format'
import { StagePlaceholder } from '../StagePlaceholder'

export function HomePage() {
  const { data: user } = useQuery(meQuery)
  const { pet, isPending } = useSelectedPet()
  // Время фиксируется при открытии страницы: рендер должен быть чистым.
  const [now] = useState(() => new Date())

  return (
    <>
      <PageHeader
        eyebrow={formatDayDate(now)}
        title={user ? `${greeting(now)}, ${user.full_name}` : greeting(now)}
        actions={
          <Link to="/pets" className={buttonClass()}>
            <Plus aria-hidden className="size-4" />
            Добавить питомца
          </Link>
        }
      />
      {isPending ? (
        <Spinner label="Загружаем питомцев" />
      ) : pet ? (
        <PetCard pet={pet} today={now} />
      ) : (
        <EmptyState
          icon={PawPrint}
          title="Добавьте первого питомца"
          description="Здесь появятся его карточка, статус ухода и дела на сегодня."
        />
      )}
      {pet && (
        <section aria-labelledby="today-title" className="mt-10">
          <Eyebrow>Дела · {pet.name}</Eyebrow>
          <h2 id="today-title" className="mt-1 text-2xl font-extrabold tracking-tight">
            Сегодня
          </h2>
          <StagePlaceholder
            className="mt-4"
            stage={11}
            icon={Inbox}
            title="План на сегодня"
            description="Ближайшее дело, прогресс курса, следующая запись и последние уведомления."
          />
        </section>
      )}
    </>
  )
}
