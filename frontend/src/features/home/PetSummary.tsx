import { useQuery } from '@tanstack/react-query'
import { homeSummaryQuery } from '../../api/queries'
import type { Pet } from '../../api/schema'
import { PetCard } from '../../components/pet/PetCard'
import { LoadError, Spinner } from '../../components/ui'
import { moscowIsoDate } from '../../lib/format'
import { ActiveCourses } from './ActiveCourses'
import { LatestNotifications } from './LatestNotifications'
import { NextAppointment } from './NextAppointment'
import { TodayReminders } from './TodayReminders'

interface PetSummaryProps {
  pet: Pet
  /** Время открытия главной: от него возраст питомца и «сегодня». */
  now: Date
  onStatus: (message: string) => void
}

/**
 * Главная выбранного питомца (БП §8): карточка со статусом ухода, дела на сегодня с просроченными, прогресс активных
 * курсов и ближайшая запись — из сводки (Р-64), последние уведомления — отдельным запросом.
 */
export function PetSummary({ pet, now, onStatus }: PetSummaryProps) {
  const summary = useQuery(homeSummaryQuery(pet.id))
  const today = moscowIsoDate(now)

  function main() {
    if (summary.isPending) return <Spinner label="Загружаем дела, курсы и записи" />
    if (!summary.data) {
      return <LoadError title="Не удалось загрузить дела, курсы и записи" onRetry={() => void summary.refetch()} />
    }
    return (
      <>
        <TodayReminders reminders={summary.data.today} today={today} onStatus={onStatus} />
        <ActiveCourses courses={summary.data.active_courses} />
      </>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Карточка — из списка питомцев, как в переключателе: после правки на «Питомцах» не мелькает старое из сводки. */}
      <PetCard pet={pet} today={now} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex min-w-0 flex-col gap-4">{main()}</div>
        <div className="flex min-w-0 flex-col gap-4">
          {summary.data && <NextAppointment appointment={summary.data.next_appointment} />}
          <LatestNotifications />
        </div>
      </div>
    </div>
  )
}
