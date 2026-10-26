import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api/client'
import { unwrap } from '../../api/queries'
import type { Appointment } from '../../api/schema'
import { Button, FormAlert, Modal } from '../../components/ui'
import { useForm } from '../../lib/use-form'
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
  const [busy, setBusy] = useState(false)
  return (
    <Modal open={open} onClose={onClose} title="Отменить запись" dismissible={!busy}>
      {open && appointment && (
        <CancelConfirm appointment={appointment} onBusyChange={setBusy} onCancel={onClose} onDone={onDone} />
      )}
    </Modal>
  )
}

interface CancelConfirmProps {
  appointment: Appointment
  /** Запрос идёт: окно нельзя закрыть, иначе запись отменится, а ответ или ошибку показать будет некому. */
  onBusyChange: (busy: boolean) => void
  onCancel: () => void
  onDone: (appointment: Appointment) => void
}

function CancelConfirm({ appointment, onBusyChange, onCancel, onDone }: CancelConfirmProps) {
  const queryClient = useQueryClient()
  const form = useForm({
    initial: {},
    validate: () => ({}),
    context: 'appointment',
    onSubmit: async () => {
      onBusyChange(true)
      try {
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
      } finally {
        onBusyChange(false)
      }
    },
  })

  // Не disabled и без действия на время запроса: отправленное не отменить, а окно должно дождаться ответа.
  function cancel() {
    if (!form.submitting) onCancel()
  }

  return (
    <form noValidate onSubmit={form.handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm">
        Запись <span className="font-bold">{appointment.pet.name}</span> в «{appointment.clinic.name}» на{' '}
        <span className="font-bold">{formatSlot(appointment.slot_start)}</span> будет отменена, а время освободится для
        других. Клиника получит уведомление.
      </p>
      <FormAlert message={form.formError} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" aria-disabled={form.submitting} onClick={cancel}>
          Не отменять
        </Button>
        {/* Не disabled: с выключенной кнопки фокус уходит на body. Повторную отправку отсекает useForm. */}
        <Button type="submit" variant="danger" aria-disabled={form.submitting}>
          {form.submitting ? 'Отменяем…' : 'Отменить запись'}
        </Button>
      </div>
    </form>
  )
}
