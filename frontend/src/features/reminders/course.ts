import type { Appointment, Prescription, PrescriptionProgress } from '../../api/schema'
import { addDays } from '../../lib/dates'

/** Курс — все дела по одному рецепту (глоссарий); рецепт — из итога завершённого приёма (Р-63). */
export interface Course {
  prescription: Prescription
  appointment: Appointment
  /** Последний день курса: дата начала + длительность − 1. */
  lastDay: string
}

/** Курсы питомца из итогов его приёмов, новые сверху. */
export function petCourses(appointments: Appointment[]): Course[] {
  return appointments
    .flatMap((appointment) =>
      (appointment.outcome?.prescriptions ?? []).map((prescription) => ({
        prescription,
        appointment,
        lastDay: addDays(prescription.start_date, prescription.duration_days - 1),
      })),
    )
    .sort((a, b) => b.prescription.start_date.localeCompare(a.prescription.start_date) || b.prescription.id - a.prescription.id)
}

/** «5 из 14 выполнено, 1 пропущено» (БП §7). */
export function progressText({ total, done, skipped }: Pick<PrescriptionProgress, 'total' | 'done' | 'skipped'>): string {
  return `${done} из ${total} выполнено` + (skipped > 0 ? `, ${skipped} пропущено` : '')
}
