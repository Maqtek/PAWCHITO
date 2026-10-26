import { vi } from 'vitest'
import type { Role } from '../api/schema'
import { loginMockAs, resetMockServer } from '../mocks/session'

/** Среда, 28 октября 2026, 09:00 по Москве — «сегодня» тестов с фиксированными часами. */
export const SEED_NOW = new Date('2026-10-28T06:00:00Z')

/**
 * Часы на SEED_NOW и seed моков, пересчитанный от этого «сегодня»; с ролью — «браузер» её аккаунта, без роли — гость
 * (тестам обработчиков cookie не нужна). Вызывается в beforeEach; настоящие часы возвращает общий afterEach из setup.ts.
 * Подделана только дата: таймеры настоящие, ожидания RTL и MSW работают как обычно.
 */
export function setSeedClock(role?: Role): void {
  vi.useFakeTimers({ toFake: ['Date'] })
  // До сброса моков: seed записей и дел считается от «сегодня».
  vi.setSystemTime(SEED_NOW)
  resetMockServer()
  if (role) loginMockAs(role)
}
