import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach } from 'vitest'
import { setAccessToken } from '../api/auth-token'
import { server } from '../mocks/node'

// Слушаем сразу: модули тестов импортируются раньше, чем срабатывают хуки.
server.listen({ onUnhandledFrame: 'error' })

// jsdom не открывает <dialog> модально — для тестов хватает атрибута open.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.open = true
}
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.open = false
}

afterEach(() => {
  cleanup()
  server.resetHandlers()
  setAccessToken(null)
  localStorage.clear()
})

afterAll(() => {
  server.close()
})
