import { ClipboardList } from 'lucide-react'
import { PageHeader } from '../../layouts/PageHeader'
import { StagePlaceholder } from '../StagePlaceholder'

export function AppointmentsPage() {
  return (
    <>
      <PageHeader eyebrow="Ветеринар" title="Записи к врачу" description="Запись в клинику, ваши записи и итоги приёмов." />
      <StagePlaceholder stage={7} icon={ClipboardList} title="Запись к врачу" description="Клиника, врач, причина и свободное время." />
    </>
  )
}
