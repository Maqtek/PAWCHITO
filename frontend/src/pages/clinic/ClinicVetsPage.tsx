import { Stethoscope } from 'lucide-react'
import { PageHeader } from '../../layouts/PageHeader'
import { StagePlaceholder } from '../StagePlaceholder'

export function ClinicVetsPage() {
  return (
    <>
      <PageHeader eyebrow="Кабинет клиники" title="Врачи" description="Состав клиники, отпуска и архив." />
      <StagePlaceholder stage={4} icon={Stethoscope} title="Список врачей" />
    </>
  )
}
