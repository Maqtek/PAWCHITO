import { PageStatus } from '../../components/ui'
import { PetRequired } from '../../features/pets/PetRequired'
import { usePetStatus } from '../../features/pets/usePetStatus'
import { useSelectedPet } from '../../features/pets/useSelectedPet'
import { PetCourses } from '../../features/reminders/PetCourses'
import { PageHeader } from '../../layouts/PageHeader'

export function CoursePage() {
  const { pet } = useSelectedPet()
  const [status, showStatus] = usePetStatus(pet?.id)

  return (
    <>
      <PageHeader
        eyebrow="Лечение"
        title="Курс лечения"
        description={pet ? `Дозы по назначению врача и прогресс курса: ${pet.name}.` : 'Дозы по назначению врача и прогресс курса.'}
      />
      <PageStatus message={status} />
      <div className="max-w-3xl">
        {/* key: при смене питомца курсы начинают с чистого листа — без чужих открытых окон. */}
        <PetRequired description="Курсы лечения назначает врач после приёма питомца.">
          {(pet) => <PetCourses key={pet.id} petId={pet.id} onStatus={showStatus} />}
        </PetRequired>
      </div>
    </>
  )
}
