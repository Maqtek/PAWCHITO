import { SEED_PASSWORD, updateServer, type MockAppointment, type MockReminder } from '../mocks/server-state'

/**
 * Аккаунт клиники «Зоовет» (4): в seed его нет, а врач у клиники есть. mustChangePassword — аккаунт, выданный
 * администратором с временным паролем. Имя аккаунта клиники — её название, его подставляют моки (Р-35).
 */
export function addZoovetAccount({ email = 'zoovet@example.com', mustChangePassword = false } = {}): void {
  updateServer((state) => {
    state.accounts.push({
      id: state.nextUserId,
      email,
      password: SEED_PASSWORD,
      role: 'clinic',
      full_name: '',
      must_change_password: mustChangePassword,
      is_active: true,
      recovery_code: null,
      clinic_id: 4,
    })
    state.nextUserId += 1
  })
}

/** Своё запланированное дело в состоянии моков; по умолчанию — Майло, «Уход», без повтора, название «Дело id». */
export function addReminder(fields: Pick<MockReminder, 'id' | 'due_at'> & Partial<MockReminder>): void {
  updateServer((state) => {
    state.reminders.push({
      pet_id: 10,
      source: 'custom',
      prescription_id: null,
      title: `Дело ${fields.id}`,
      category: 'routine',
      status: 'pending',
      done_at: null,
      repeat_interval_days: null,
      series_id: null,
      ...fields,
    })
  })
}

/** Запись в состоянии моков; по умолчанию — заявка Майло к Петрову на плановый осмотр. */
export function addAppointment(fields: Pick<MockAppointment, 'id' | 'slot_start'> & Partial<MockAppointment>): void {
  updateServer((state) => {
    state.appointments.push({
      pet_id: 10,
      vet_id: 4,
      reason: 'checkup',
      reason_comment: null,
      status: 'requested',
      cancelled_by: null,
      clinic_comment: null,
      outcome: null,
      ...fields,
    })
  })
}
