import { adminHandlers } from './admin'
import { authHandlers } from './auth'
import { networkHandlers } from './network'
import { notificationHandlers } from './notifications'
import { petHandlers } from './pets'
import { vetHandlers } from './vets'

// Выключатель сети стоит первым: при network: false он отвечает раньше остальных.
export const handlers = [
  ...networkHandlers,
  ...authHandlers,
  ...adminHandlers,
  ...vetHandlers,
  ...petHandlers,
  ...notificationHandlers,
]
