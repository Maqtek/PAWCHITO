import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/render'
import { RevealOnceScreen } from './RevealOnceScreen'

const SECRET = 'vT4q-9mKx-2Lpe'

function renderReveal({ onContinue = vi.fn(), headingLevel }: { onContinue?: () => void; headingLevel?: 'h2' | 'h3' } = {}) {
  const result = renderWithProviders(
    <RevealOnceScreen
      secret={SECRET}
      heading="Временный пароль клиники"
      note="Передайте пароль клинике."
      confirmLabel="Пароль передан клинике"
      copiedText="Пароль скопирован"
      manualText="Выделите пароль и скопируйте вручную"
      continueLabel="Готово"
      onContinue={onContinue}
      headingLevel={headingLevel}
    />,
  )
  return { ...result, onContinue }
}

describe('RevealOnceScreen', () => {
  it('тексты из пропсов; фокус на заголовке; «Готово» только после отметки', async () => {
    const { user, onContinue } = renderReveal()
    expect(screen.getByRole('heading', { level: 2, name: 'Временный пароль клиники' })).toHaveFocus()
    expect(screen.getByText(SECRET)).toBeInTheDocument()
    expect(screen.getByText('Передайте пароль клинике.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Готово' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Пароль передан клинике' }))
    await user.click(screen.getByRole('button', { name: 'Готово' }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('секрет переносится только между группами: после дефиса — wbr', () => {
    renderReveal()
    const secret = screen.getByText(SECRET)
    expect(secret).toHaveTextContent(SECRET)
    expect(secret.innerHTML).toBe('vT4q-<wbr>9mKx-<wbr>2Lpe')
    expect(secret).not.toHaveClass('break-all')
  })

  it('пустая строка статуса — в одном блоке с кнопкой «Скопировать»', () => {
    renderReveal()
    const status = screen.getByRole('status')
    expect(status).toBeEmptyDOMElement()
    // Отступ секции не ставится перед пустой строкой: у кнопки и статуса свой общий блок.
    const group = screen.getByRole('button', { name: 'Скопировать' }).parentElement
    expect(group?.children).toHaveLength(2)
    expect(group).toContainElement(status)
  })

  it('копирование — секрет в буфере, свой текст статуса', async () => {
    const { user } = renderReveal()
    await user.click(screen.getByRole('button', { name: 'Скопировать' }))
    expect(await screen.findByText('Пароль скопирован')).toBeInTheDocument()
    await expect(navigator.clipboard.readText()).resolves.toBe(SECRET)
  })

  it('буфер недоступен — секрет выделяется, свой текст подсказки', async () => {
    const { user } = renderReveal()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'))
    await user.click(screen.getByRole('button', { name: 'Скопировать' }))
    expect(await screen.findByText('Выделите пароль и скопируйте вручную')).toBeInTheDocument()
    expect(window.getSelection()?.toString()).toBe(SECRET)
  })

  it('пока экран открыт, браузер переспросит при уходе со страницы', () => {
    const { unmount } = renderReveal()
    const leaving = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(leaving)
    expect(leaving.defaultPrevented).toBe(true)

    unmount()
    const later = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(later)
    expect(later.defaultPrevented).toBe(false)
  })

  it('в модалке — заголовок h3', () => {
    renderReveal({ headingLevel: 'h3' })
    expect(screen.getByRole('heading', { level: 3, name: 'Временный пароль клиники' })).toHaveFocus()
  })
})
