import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import { unwrap } from '../../api/queries'
import type { Appointment } from '../../api/schema'
import { ConfirmActionModal } from '../../components/ConfirmActionModal'
import { refetchAppointments, storeAppointment } from './appointment-cache'
import { formatSlot } from './format'

interface CancelAppointmentModalProps {
  open: boolean
  appointment?: Appointment
  onClose: () => void
  onDone: (appointment: Appointment) => void
}

/** Подтверждение отмены записи владельцем (Р-48). */
export function CancelAppointmentModal({ open, appointment, onClose, onDone }: CancelAppointmentModalProps) {
  const queryClient = useQueryClient()

  async function cancel() {
    if (!appointment) return
    const cancelled = await unwrap(
      api.POST('/appointments/{id}/cancel', {
        params: { path: { id: appointment.id } },
      }),
    ).catch((error: unknown) => {
      refetchAppointments(queryClient)
      throw error
    })
    storeAppointment(queryClient, cancelled)
    onDone(cancelled)
  }

  return (
    <ConfirmActionModal
      open={open}
      title="Отменить запись"
      submitLabel="Отменить запись"
      submittingLabel="Отменяем…"
      cancelLabel="Не отменять"
      context="appointment"
      onConfirm={cancel}
      onClose={onClose}
    >
      {appointment && (
        <p className="text-sm">
          Запись <span className="font-bold">{appointment.pet.name}</span> в «{appointment.clinic.name}» на{' '}
          <span className="font-bold">{formatSlot(appointment.slot_start)}</span> будет отменена, а время освободится для
          других. Клиника получит уведомление.
        </p>
      )}
    </ConfirmActionModal>
  )
}
