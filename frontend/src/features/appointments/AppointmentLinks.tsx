import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { buttonClass, linkClass } from '../../components/ui'
import { cn } from '../../lib/cn'

interface AppointmentDetailsLinkProps {
  id: number
  /** Время записи — в подписи для скринридера: записей на экране бывает несколько, у каждой ссылки своя подпись. */
  when: string
  className?: string
}

/** «Подробнее» — на страницу записи. */
export function AppointmentDetailsLink({ id, when, className }: AppointmentDetailsLinkProps) {
  return (
    <Link to={`/appointments/${id}`} className={cn(buttonClass({ variant: 'secondary', size: 'sm' }), className)}>
      Подробнее
      <span className="sr-only">, запись на {when}</span>
    </Link>
  )
}

/** «← Все записи» — над страницей записи и мастером записи. */
export function AllAppointmentsLink() {
  return (
    <Link to="/appointments" className={linkClass}>
      <ArrowLeft aria-hidden className="mr-1 inline size-4" />
      Все записи
    </Link>
  )
}
