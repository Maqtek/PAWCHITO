import { HttpResponse } from 'msw'
import { onSessionChange, type SessionEvent } from '../api/session'
import { SESSION_CHANNEL } from './storage-keys'

/** События сессии этой вкладки по порядку. */
export function collectEvents() {
  const events: SessionEvent[] = []
  onSessionChange((event) => events.push(event))
  return events
}

/** Тело ответа с access-токеном — как у /auth/login и /auth/refresh. */
export const tokenBody = (token: string) => ({ access_token: token, token_type: 'bearer' as const, expires_in: 900 })

export const tokenResponse = (token: string) => HttpResponse.json(tokenBody(token))

const openTabs: BroadcastChannel[] = []

/** Вторая «вкладка»: свой канал с тем же именем; received — что ей пришло. Закрывается в closeOtherTabs. */
export function otherTab() {
  const channel = new BroadcastChannel(SESSION_CHANNEL)
  const received: unknown[] = []
  channel.onmessage = (event: MessageEvent) => received.push(event.data)
  openTabs.push(channel)
  return { channel, received }
}

export function closeOtherTabs(): void {
  openTabs.splice(0).forEach((channel) => channel.close())
}
