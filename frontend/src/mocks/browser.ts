import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'
import { createConsoleHelpers } from './session'

export const worker = setupWorker(...handlers)
export { onUnhandledFrame } from './unhandled'

/** Ручная проверка из консоли: pawchitoMocks.expireAccess(), .endSessions(), .requirePasswordChange(), .startVisit(), .network(false), .reset(). */
export const pawchitoMocks = createConsoleHelpers()
