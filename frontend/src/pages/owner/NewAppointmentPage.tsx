import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { linkClass } from '../../components/ui'
import { BookingWizard } from '../../features/appointments/BookingWizard'
import { PetRequired } from '../../features/pets/PetRequired'
import { useSelectedPet } from '../../features/pets/useSelectedPet'
import { PageHeader } from '../../layouts/PageHeader'

export function NewAppointmentPage() {
  const { pets } = useSelectedPet()
  const navigate = useNavigate()

  return (
    <>
      <PageHeader eyebrow="Ветеринар" title="Запись к врачу" description="Клиника, врач, свободное время и причина." />
      <div className="mb-4">
        <Link to="/appointments" className={linkClass}>
          <ArrowLeft aria-hidden className="mr-1 inline size-4" />
          Все записи
        </Link>
      </div>
      <PetRequired description="Запись к врачу делается для конкретного питомца.">
        {(pet) => (
          <BookingWizard
            pets={pets}
            selectedPetId={pet.id}
            onBooked={(appointment) =>
              navigate(`/appointments/${appointment.id}`, {
                state: { status: 'Заявка отправлена. Клиника подтвердит запись — статус появится здесь.' },
              })
            }
          />
        )}
      </PetRequired>
    </>
  )
}
