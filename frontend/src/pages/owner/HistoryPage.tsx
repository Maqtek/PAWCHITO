import { HistoryIcon, NotebookText } from 'lucide-react'
import { PageHeader } from '../../layouts/PageHeader'
import { StagePlaceholder } from '../StagePlaceholder'

export function HistoryPage() {
  return (
    <>
      <PageHeader eyebrow="Здоровье" title="История" description="Наблюдения, приёмы, курсы и прививки по порядку." />
      <StagePlaceholder stage={6} icon={NotebookText} title="Дневник, прививки и особенности здоровья" />
      <StagePlaceholder className="mt-4" stage={11} icon={HistoryIcon} title="Лента истории" />
    </>
  )
}
