import { PageStatus } from '../../components/ui'
import { ConditionsSection } from '../../features/health/ConditionsSection'
import { DiarySection } from '../../features/health/DiarySection'
import { VaccinationsSection } from '../../features/health/VaccinationsSection'
import { PetRequired } from '../../features/pets/PetRequired'
import { usePetStatus } from '../../features/pets/usePetStatus'
import { useSelectedPet } from '../../features/pets/useSelectedPet'
import { TimelineSection } from '../../features/timeline/TimelineSection'
import { PageHeader } from '../../layouts/PageHeader'

export function HistoryPage() {
  const { pet } = useSelectedPet()
  const [status, showStatus] = usePetStatus(pet?.id)

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
      <PageStatus message={status} />
      <div className="max-w-3xl">
        {/* key: при смене питомца разделы начинают с чистого листа — без чужих открытых окон. */}
        <PetRequired description="История ведётся для каждого питомца отдельно.">
          {(pet) => (
            <div key={pet.id} className="flex flex-col gap-4">
              <ConditionsSection petId={pet.id} onStatus={showStatus} />
              <DiarySection petId={pet.id} onStatus={showStatus} />
              <VaccinationsSection petId={pet.id} onStatus={showStatus} />
              <TimelineSection petId={pet.id} />
            </div>
          )}
        </PetRequired>
      </div>
    </>
  )
}
