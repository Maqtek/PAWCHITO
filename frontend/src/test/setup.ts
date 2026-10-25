import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeEach } from 'vitest'
import { resetSessionForTests } from '../api/session'
import { server } from '../mocks/node'
import { loginMockAs, resetMockServer } from '../mocks/session'

// Слушаем сразу: модули тестов импортируются раньше, чем срабатывают хуки.
server.listen({ onUnhandledFrame: 'error' })

// Первый тест файла при параллельном прогоне прогревает jsdom, MSW и React около секунды —
// ровно столько ждут findBy/waitFor по умолчанию. С запасом, чтобы набор не мигал под нагрузкой.
configure({ asyncUtilTimeout: 3000 })

// jsdom не открывает <dialog> модально — для тестов хватает атрибута open.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.open = true
}
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.open = false
}

// По умолчанию тест идёт от вошедшего владельца: у «браузера» есть его refresh-cookie.
beforeEach(() => {
  resetMockServer()
  loginMockAs('owner')
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetSessionForTests()
  localStorage.clear()
})

afterAll(() => {
  server.close()
})
