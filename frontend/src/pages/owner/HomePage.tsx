import { useQuery } from '@tanstack/react-query'
import { CloudOff, PawPrint, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { meQuery } from '../../api/queries'
import { buttonClass, EmptyState, LoadError, Spinner } from '../../components/ui'
import { PetSummary } from '../../features/home/PetSummary'
import { useSelectedPet } from '../../features/pets/useSelectedPet'
import { PageHeader } from '../../layouts/PageHeader'
import { displayName, formatDayDate, greeting } from '../../lib/format'

export function HomePage() {
  const { data: user } = useQuery(meQuery)
  const { pet, isPending, isError, refetch } = useSelectedPet()
  // Время фиксируется при открытии страницы: рендер должен быть чистым.
  const [now] = useState(() => new Date())
  // Сообщение относится к питомцу, при котором его показали: после переключения оно не висит над чужими делами.
  const [status, setStatus] = useState<{ petId: number; text: string } | null>(null)

  function content() {
    if (isPending) return <Spinner label="Загружаем питомцев" />
    if (!pet && isError) return <LoadError icon={CloudOff} title="Не удалось загрузить питомцев" onRetry={() => void refetch()} />
    if (!pet) {
      return (
        <EmptyState
          icon={PawPrint}
          title="Добавьте первого питомца"
          description="Здесь появятся его карточка, статус ухода, дела на сегодня и ближайшая запись к врачу."
        />
      )
    }
    // key: при смене питомца сводка начинает с чистого листа — без чужих открытых окон.
    return <PetSummary key={pet.id} pet={pet} now={now} onStatus={(text) => setStatus({ petId: pet.id, text })} />
  }

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
      {/* Регион статуса смонтирован в любом состоянии страницы: сообщение в уже существующем регионе скринридер озвучит. */}
      <p role="status" className="mb-4 text-sm font-semibold text-primary empty:mb-0">
        {status && status.petId === pet?.id ? status.text : ''}
      </p>
      {content()}
    </>
  )
}
