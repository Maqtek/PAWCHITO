import { useQuery } from '@tanstack/react-query'
import { Route } from 'lucide-react'
import { useId, useState } from 'react'
import { petAppointmentsQuery, prescriptionProgressQuery } from '../../api/queries'
import { Button, Card, EmptyState, Spinner } from '../../components/ui'
import { formatShortDate, moscowIsoDate } from '../../lib/format'
import { ActiveCourse } from './ActiveCourse'
import { petCourses, progressText, type Course } from './course'

interface PetCoursesProps {
  petId: number
  onStatus: (message: string) => void
}

/** Курсы питомца из итогов приёмов (Р-63): активные — с днями и отметкой, завершённые — только прогресс. */
export function PetCourses({ petId, onStatus }: PetCoursesProps) {
  const appointments = useQuery(petAppointmentsQuery(petId))
  const [today] = useState(() => moscowIsoDate(new Date()))
  const completedId = useId()

  if (appointments.isPending) return <Spinner label="Загружаем курсы лечения" />
  if (!appointments.data) {
    return (
      <EmptyState
        title="Не удалось загрузить курсы лечения"
        description="Проверьте соединение и попробуйте ещё раз."
        action={<Button onClick={() => void appointments.refetch()}>Повторить</Button>}
      />
    )
  }
  const courses = petCourses(appointments.data)
  if (courses.length === 0) {
    return (
      <EmptyState
        icon={Route}
        title="Курсов лечения нет"
        description="Курс появится, когда врач назначит лечение в итоге приёма. Дозы по нему придут в раздел «Дела»."
      />
    )
  }
  const active = courses.filter((course) => course.lastDay >= today)
  const completed = courses.filter((course) => course.lastDay < today)
  return (
    <div className="flex flex-col gap-4">
      {active.length === 0 && <EmptyState icon={Route} title="Активных курсов нет" description="Все назначенные курсы завершены." />}
      {active.map((course) => (
        <ActiveCourse key={course.prescription.id} course={course} today={today} onStatus={onStatus} />
      ))}
      {completed.length > 0 && (
        <section aria-labelledby={completedId}>
          <Card className="p-5 sm:p-6">
            <h2 id={completedId} className="text-lg font-extrabold">
              Завершённые курсы
            </h2>
            <ul className="mt-4 flex flex-col gap-3">
              {completed.map((course) => (
                <li key={course.prescription.id}>
                  <CompletedCourse course={course} />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  )
}

function CompletedCourse({ course }: { course: Course }) {
  const { prescription, appointment, lastDay } = course
  const progress = useQuery(prescriptionProgressQuery(prescription.id))
  return (
    <div className="rounded-xl border border-line p-4 text-sm">
      <p className="font-extrabold break-words">
        {prescription.drug}, {prescription.dosage}
      </p>
      <p className="text-ink-muted">
        С {formatShortDate(prescription.start_date)} по {formatShortDate(lastDay)} · {appointment.clinic.name}
      </p>
      <p className="mt-1">
        {progress.data ? progressText(progress.data) : progress.isPending ? 'Загружаем прогресс…' : 'Прогресс не загрузился'}
      </p>
    </div>
  )
}
