import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach } from 'vitest'
import { resetSessionForTests } from '../api/session'
import { server } from '../mocks/node'

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

afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetSessionForTests()
  localStorage.clear()
})

afterAll(() => {
  server.close()
})
