import { PawPrint } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { buttonClass, EmptyState, LoadError, PageStatus, Spinner } from '../../components/ui'
import { useSelectedPet } from '../../features/pets/useSelectedPet'
import { PetCourses } from '../../features/reminders/PetCourses'
import { PageHeader } from '../../layouts/PageHeader'

export function CoursePage() {
  const { pet, isPending, isError, refetch } = useSelectedPet()
  // Сообщение относится к питомцу, при котором его показали: после переключения оно не висит над чужим курсом.
  const [status, setStatus] = useState<{ petId: number; text: string } | null>(null)

  function content() {
    if (isPending) return <Spinner label="Загружаем питомцев" />
    if (!pet && isError) return <LoadError title="Не удалось загрузить питомцев" onRetry={() => void refetch()} />
    if (!pet) {
      return (
        <EmptyState
          icon={PawPrint}
          title="Сначала добавьте питомца"
          description="Курсы лечения назначает врач после приёма питомца."
          action={
            <Link to="/pets" className={buttonClass()}>
              Добавить питомца
            </Link>
          }
        />
      )
    }
    // key: при смене питомца курсы начинают с чистого листа — без чужих открытых окон.
    return <PetCourses key={pet.id} petId={pet.id} onStatus={(text) => setStatus({ petId: pet.id, text })} />
  }

  return (
    <>
      <PageHeader
        eyebrow="Лечение"
        title="Курс лечения"
        description={pet ? `Дозы по назначению врача и прогресс курса: ${pet.name}.` : 'Дозы по назначению врача и прогресс курса.'}
      />
      <PageStatus message={status && status.petId === pet?.id ? status.text : ''} />
      <div className="max-w-3xl">{content()}</div>
    </>
  )
}
