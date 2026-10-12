import { PawPrint } from 'lucide-react'
import { PageHeader } from '../../layouts/PageHeader'
import { StagePlaceholder } from '../StagePlaceholder'

export function ClinicPetPage() {
  return (
    <>
      <PageHeader eyebrow="Кабинет клиники" title="Карточка питомца" />
      <StagePlaceholder stage={8} icon={PawPrint} title="Данные питомца для клиники" description="Особенности здоровья, прививки и приёмы в вашей клинике." />
    </>
  )
}
