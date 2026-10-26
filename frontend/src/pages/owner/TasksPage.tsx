import { PageStatus } from '../../components/ui'
import { PetRequired } from '../../features/pets/PetRequired'
import { usePetStatus } from '../../features/pets/usePetStatus'
import { useSelectedPet } from '../../features/pets/useSelectedPet'
import { PlannedReminders } from '../../features/reminders/PlannedReminders'
import { PageHeader } from '../../layouts/PageHeader'

export function TasksPage() {
  const { pet } = useSelectedPet()
  const [status, showStatus] = usePetStatus(pet?.id)

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
      <PageStatus message={status} />
      <div className="max-w-3xl">
        {/* key: при смене питомца календарь начинает с чистого листа — без чужих открытых окон и развёрнутых списков. */}
        <PetRequired description="Дела ведутся для каждого питомца отдельно.">
          {(pet) => <PlannedReminders key={pet.id} pet={pet} onStatus={showStatus} />}
        </PetRequired>
      </div>
    </>
  )
}
