import { authHandlers } from './auth'
import { notificationHandlers } from './notifications'
import { petHandlers } from './pets'

export const handlers = [...authHandlers, ...petHandlers, ...notificationHandlers]
