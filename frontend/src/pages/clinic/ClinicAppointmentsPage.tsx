import { ClipboardList } from 'lucide-react'
import { PageHeader } from '../../layouts/PageHeader'
import { StagePlaceholder } from '../StagePlaceholder'

export function ClinicAppointmentsPage() {
  return (
    <>
      <PageHeader eyebrow="Кабинет клиники" title="Записи" description="Заявки, подтверждённые приёмы и итоги." />
      <StagePlaceholder stage={8} icon={ClipboardList} title="Записи клиники" description="Фильтры по статусу и дате, подтверждение, отмена, итог приёма." />
    </>
  )
}
