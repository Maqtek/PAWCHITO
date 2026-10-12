import { Inbox } from 'lucide-react'
import { PageHeader } from '../../layouts/PageHeader'
import { StagePlaceholder } from '../StagePlaceholder'

export function TasksPage() {
  return (
    <>
      <PageHeader eyebrow="Уход" title="Дела" description="Всё, что нужно питомцу: сегодня, завтра и позже." />
      <StagePlaceholder stage={10} icon={Inbox} title="Список дел" description="Дела курса, свои дела, записи и сроки прививок по времени." />
    </>
  )
}
