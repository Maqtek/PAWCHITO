import { adminHandlers } from './admin'
import { appointmentHandlers } from './appointments'
import { authHandlers } from './auth'
import { calendarHandlers } from './calendar'
import { clinicAppointmentHandlers } from './clinic-appointments'
import { healthHandlers } from './health'
import { homeHandlers } from './home'
import { networkHandlers } from './network'
import { notificationHandlers } from './notifications'
import { outcomeHandlers } from './outcome'
import { petHandlers } from './pets'
import { reminderHandlers } from './reminders'
import { timelineHandlers } from './timeline'
import { vetHandlers } from './vets'

// Выключатель сети стоит первым: при network: false он отвечает раньше остальных.
export const handlers = [
  ...networkHandlers,
  ...authHandlers,
  ...adminHandlers,
  ...vetHandlers,
  ...petHandlers,
  ...healthHandlers,
  ...appointmentHandlers,
  ...clinicAppointmentHandlers,
  ...outcomeHandlers,
  ...reminderHandlers,
  ...homeHandlers,
  ...calendarHandlers,
  ...timelineHandlers,
  ...notificationHandlers,
]
