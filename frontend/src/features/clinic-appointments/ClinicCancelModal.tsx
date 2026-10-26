import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api/client'
import { validationMessages } from '../../api/error-messages'
import { appointmentLimits } from '../../api/limits'
import { unwrap } from '../../api/queries'
import type { Appointment } from '../../api/schema'
import { REQUEST_TIMEOUT_MS } from '../../api/session'
import { Button, FormAlert, Modal, TextareaField } from '../../components/ui'
import { useForm } from '../../lib/use-form'
import { formatSlot } from '../appointments/format'
import { refetchClinicAppointments } from './clinic-appointment-cache'

interface ClinicCancelModalProps {
  open: boolean
  appointment?: Appointment
  onClose: () => void
  onDone: (appointment: Appointment) => void
}

/** Отмена записи клиникой: комментарий владельцу обязателен (БП §5, Р-53). */
export function ClinicCancelModal({ open, appointment, onClose, onDone }: ClinicCancelModalProps) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal open={open} onClose={onClose} title="Отменить запись" dismissible={!busy}>
      {open && appointment && (
        <CancelForm appointment={appointment} onBusyChange={setBusy} onCancel={onClose} onDone={onDone} />
      )}
    </Modal>
  )
}

interface CancelFormProps {
  appointment: Appointment
  /** Запрос идёт: окно нельзя закрыть, иначе запись отменится, а ответ или ошибку показать будет некому. */
  onBusyChange: (busy: boolean) => void
  onCancel: () => void
  onDone: (appointment: Appointment) => void
}

function CancelForm({ appointment, onBusyChange, onCancel, onDone }: CancelFormProps) {
  const queryClient = useQueryClient()
  // Время читается один раз при открытии окна: рендер должен быть чистым.
  const [started] = useState(() => new Date(appointment.slot_start).getTime() <= Date.now())
  const form = useForm({
    initial: { comment: '' },
    validate: (values) => ({ comment: values.comment.trim() ? undefined : validationMessages.clinicComment }),
    context: 'clinic-appointment',
    onSubmit: async ({ comment }) => {
      onBusyChange(true)
      try {
        const cancelled = await unwrap(
          api.POST('/clinic/appointments/{id}/cancel', {
            params: { path: { id: appointment.id } },
            body: { comment: comment.trim() },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          }),
        ).finally(() => refetchClinicAppointments(queryClient))
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
        <span className="font-bold">{appointment.pet.name}</span>, {formatSlot(appointment.slot_start)}, врач{' '}
        {appointment.vet.full_name}.{' '}
        {started
          ? 'Время приёма прошло — так закрывают неявку.'
          : 'Время освободится для других владельцев.'}{' '}
        Владелец получит уведомление с вашим комментарием.
      </p>
      <TextareaField
        label="Комментарий для владельца"
        hint="Например: «Врач заболел, перезапишитесь на другое время»"
        rows={3}
        maxLength={appointmentLimits.reasonCommentMax}
        {...form.field('comment')}
      />
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
