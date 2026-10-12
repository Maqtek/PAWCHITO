import { Building2 } from 'lucide-react'
import { PageHeader } from '../../layouts/PageHeader'
import { StagePlaceholder } from '../StagePlaceholder'

export function AdminClinicsPage() {
  return (
    <>
      <PageHeader eyebrow="Администрирование" title="Клиники" description="Клиники, их аккаунты и часы работы." />
      <StagePlaceholder stage={3} icon={Building2} title="Список клиник" />
    </>
  )
}
