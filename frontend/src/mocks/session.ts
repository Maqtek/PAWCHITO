import type { Role } from '../api/schema'
import { issueRefreshToken, seedState, updateServer, writeMockCookie, writeServer } from './server-state'

export { readMockCookie } from './server-state'

const ROLE_EMAILS: Record<Role, string> = {
  owner: 'owner@example.com',
  clinic: 'clinic@example.com',
  admin: 'admin@example.com',
}

/** Возвращает мок-сервер к seed и стирает cookie. */
export function resetMockServer(options?: { refreshDelayMs?: number }): void {
  writeServer(seedState(options))
  writeMockCookie(null)
}

/** «Браузер» получает refresh-cookie seed-аккаунта, как после входа. Роль — её основной аккаунт, иначе email. */
export function loginMockAs(roleOrEmail: string): void {
  const email = roleOrEmail in ROLE_EMAILS ? ROLE_EMAILS[roleOrEmail as Role] : roleOrEmail
  updateServer((state) => {
    const account = state.accounts.find((item) => item.email === email)
    if (!account) throw new Error(`Нет мок-аккаунта ${email}`)
    writeMockCookie(issueRefreshToken(state, account.id))
  })
}

/** «Браузер» без cookie — гость. */
export function logoutMock(): void {
  writeMockCookie(null)
}

/** «Прошло 15 минут»: выданные access-токены перестают действовать, refresh-cookie живёт. */
export function expireMockAccess(): void {
  updateServer((state) => {
    state.accessEpoch += 1
  })
}

/** Сервер завершил все сессии: access-токены недействительны, refresh-токены отозваны. */
export function endMockSessions(): void {
  updateServer((state) => {
    state.accessEpoch += 1
    for (const record of Object.values(state.refreshTokens)) record.revoked = true
  })
}

export function setMockNetwork(on: boolean): void {
  updateServer((state) => {
    state.network = on
  })
}

/** Команды для консоли браузера: window.pawchitoMocks. */
export function createConsoleHelpers() {
  return {
    expireAccess: expireMockAccess,
    endSessions: endMockSessions,
    /** «Сеть» моков; приложение узнаёт о ней, как о настоящей, — событием online/offline. */
    network(on: boolean) {
      setMockNetwork(on)
      window.dispatchEvent(new Event(on ? 'online' : 'offline'))
    },
    reset: () => resetMockServer(),
  }
}
