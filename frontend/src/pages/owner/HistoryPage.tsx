import { PawPrint } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { buttonClass, Button, EmptyState, Spinner } from '../../components/ui'
import { ConditionsSection } from '../../features/health/ConditionsSection'
import { DiarySection } from '../../features/health/DiarySection'
import { VaccinationsSection } from '../../features/health/VaccinationsSection'
import { useSelectedPet } from '../../features/pets/useSelectedPet'
import { TimelineSection } from '../../features/timeline/TimelineSection'
import { PageHeader } from '../../layouts/PageHeader'

export function HistoryPage() {
  const { pet, isPending, isError, refetch } = useSelectedPet()
  // Сообщение относится к питомцу, при котором его показали: после переключения оно не висит над чужими записями.
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
          description="История ведётся для каждого питомца отдельно."
          action={
            <Link to="/pets" className={buttonClass()}>
              Добавить питомца
            </Link>
          }
        />
      )
    }
    const onStatus = (text: string) => setStatus({ petId: pet.id, text })
    return (
      // key: при смене питомца разделы начинают с чистого листа — без чужих открытых окон.
      <div key={pet.id} className="flex flex-col gap-4">
        <ConditionsSection petId={pet.id} onStatus={onStatus} />
        <DiarySection petId={pet.id} onStatus={onStatus} />
        <VaccinationsSection petId={pet.id} onStatus={onStatus} />
        <TimelineSection petId={pet.id} />
      </div>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Здоровье"
        title="История"
        description={
          pet
            ? `Особенности здоровья, дневник, прививки и лента истории: ${pet.name}.`
            : 'Особенности здоровья, дневник, прививки и лента истории питомца.'
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
