import { Route } from 'lucide-react'
import { PageHeader } from '../../layouts/PageHeader'
import { StagePlaceholder } from '../StagePlaceholder'

export function CoursePage() {
  return (
    <>
      <PageHeader eyebrow="Лечение" title="Курс лечения" description="Дозы по назначению врача и прогресс курса." />
      <StagePlaceholder stage={10} icon={Route} title="Активные курсы" description="Дни курса, план на сегодня и отметка доз." />
    </>
  )
}
