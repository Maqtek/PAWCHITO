import { useId } from 'react'
import { Link } from 'react-router-dom'
import type { HomeCourse } from '../../api/schema'
import { Card, linkClass, ProgressBar } from '../../components/ui'
import { progressText } from '../reminders/course'

/** Прогресс активных курсов (Р-64); дни и дозы — в разделе «Курс лечения». */
export function ActiveCourses({ courses }: { courses: HomeCourse[] }) {
  const headingId = useId()

  return (
    <section aria-labelledby={headingId}>
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id={headingId} className="text-lg font-extrabold">
            Лечение
          </h2>
          {courses.length > 0 && (
            <Link to="/course" className={`${linkClass} text-sm`}>
              Курс лечения
            </Link>
          )}
        </div>
        {courses.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">
            Активных курсов нет. Курс появится, когда врач назначит лечение в итоге приёма.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {courses.map((course) => (
              <li key={course.prescription_id}>
                <CourseProgress course={course} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  )
}

function CourseProgress({ course }: { course: HomeCourse }) {
  const titleId = useId()
  // Название — как у дел курса: «препарат, дозировка» (Р-63).
  const title = `${course.drug}, ${course.dosage}`
  const progress = progressText(course)

  return (
    <article aria-labelledby={titleId}>
      <h3 id={titleId} className="font-extrabold break-words">
        {title}
      </h3>
      <p className="mt-1 text-sm">{progress}</p>
      <ProgressBar className="mt-2" value={course.done} max={course.total} label={`Прогресс курса: ${progress}`} />
    </article>
  )
}
