import { NotebookText } from 'lucide-react'
import { PageHeader } from '../../layouts/PageHeader'
import { StagePlaceholder } from '../StagePlaceholder'

export function HistoryPage() {
  return (
    <>
      <PageHeader eyebrow="Здоровье" title="История" description="Наблюдения, приёмы, курсы и прививки по порядку." />
      <StagePlaceholder
        stage={6}
        icon={NotebookText}
        title="Дневник, прививки и особенности здоровья"
        description="Лента истории добавится на этапе 11."
      />
    </>
  )
}
