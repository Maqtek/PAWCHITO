import { PawPrint } from 'lucide-react'
import { PageHeader } from '../../layouts/PageHeader'
import { StagePlaceholder } from '../StagePlaceholder'

export function PetsPage() {
  return (
    <>
      <PageHeader title="Питомцы" description="Добавляйте питомцев, меняйте их данные и переносите в архив." />
      <StagePlaceholder stage={5} icon={PawPrint} title="Список питомцев" />
    </>
  )
}
