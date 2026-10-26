import { ArrowLeft, PawPrint } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, buttonClass, EmptyState, linkClass, Spinner } from '../../components/ui'
import { BookingWizard } from '../../features/appointments/BookingWizard'
import { useSelectedPet } from '../../features/pets/useSelectedPet'
import { PageHeader } from '../../layouts/PageHeader'

export function NewAppointmentPage() {
  const { pets, pet, isPending, isError, refetch } = useSelectedPet()
  const navigate = useNavigate()

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
          description="Запись к врачу делается для конкретного питомца."
          action={
            <Link to="/pets" className={buttonClass()}>
              Добавить питомца
            </Link>
          }
        />
      )
    }
    return (
      <BookingWizard
        pets={pets}
        selectedPetId={pet.id}
        onBooked={(appointment) =>
          navigate(`/appointments/${appointment.id}`, {
            state: { status: 'Заявка отправлена. Клиника подтвердит запись — статус появится здесь.' },
          })
        }
      />
    )
  }

  return (
    <>
      <PageHeader eyebrow="Ветеринар" title="Запись к врачу" description="Клиника, врач, свободное время и причина." />
      <div className="mb-4">
        <Link to="/appointments" className={linkClass}>
          <ArrowLeft aria-hidden className="mr-1 inline size-4" />
          Все записи
        </Link>
      </div>
      {content()}
    </>
  )
}
