import { PawPrint } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { buttonClass, Button, EmptyState, Spinner } from '../../components/ui'
import { useSelectedPet } from '../../features/pets/useSelectedPet'
import { PlannedReminders } from '../../features/reminders/PlannedReminders'
import { PageHeader } from '../../layouts/PageHeader'

export function TasksPage() {
  const { pet, isPending, isError, refetch } = useSelectedPet()
  // Сообщение относится к питомцу, при котором его показали: после переключения оно не висит над чужими делами.
  const [status, setStatus] = useState<{ petId: number; text: string } | null>(null)

  function content() {
    if (isPending) return <Spinner label="Загружаем питомцев" />
    if (!pet && isError) {
      return (
        <EmptyState
          title="Не удалось загрузить питомцев"
          description="Проверьте соединение и попробуйте ещё раз."
          action={<Button onClick={() => void refetch()}>Повторить</Button>}
        />
      )
    }
    if (!pet) {
      return (
        <EmptyState
          icon={PawPrint}
          title="Сначала добавьте питомца"
          description="Дела ведутся для каждого питомца отдельно."
          action={
            <Link to="/pets" className={buttonClass()}>
              Добавить питомца
            </Link>
          }
        />
      )
    }
    // key: при смене питомца календарь начинает с чистого листа — без чужих открытых окон и развёрнутых списков.
    return <PlannedReminders key={pet.id} pet={pet} onStatus={(text) => setStatus({ petId: pet.id, text })} />
  }

  return (
    <>
      <PageHeader
        eyebrow="Календарь"
        title="Дела"
        description={
          pet
            ? `Дела, записи к врачу и сроки прививок на 30 дней вперёд: ${pet.name}.`
            : 'Дела, записи к врачу и сроки прививок питомца.'
        }
      />
      {/* Регион статуса смонтирован в любом состоянии страницы: сообщение в уже существующем регионе скринридер озвучит. */}
      <p role="status" className="mb-4 text-sm font-semibold text-primary empty:mb-0">
        {status && status.petId === pet?.id ? status.text : ''}
      </p>
      <div className="max-w-3xl">{content()}</div>
    </>
  )
}
