import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/render'
import { RecoveryCodeScreen } from './RecoveryCodeScreen'

const CODE = 'K7QM-2XPA-9RTD-4WNB'

describe('RecoveryCodeScreen', () => {
  it('показывает код, фокус на заголовке', () => {
    renderWithProviders(<RecoveryCodeScreen code={CODE} onContinue={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Сохраните код восстановления' })).toHaveFocus()
    expect(screen.getByText(CODE)).toBeInTheDocument()
  })

  it('код переносится только между группами: после дефиса — wbr', () => {
    renderWithProviders(<RecoveryCodeScreen code={CODE} onContinue={() => {}} />)
    const code = screen.getByText(CODE)
    expect(code).toHaveTextContent(CODE)
    expect(code.innerHTML).toBe('K7QM-<wbr>2XPA-<wbr>9RTD-<wbr>4WNB')
    expect(code).not.toHaveClass('break-all')
  })

  it('пустая строка статуса — в одном блоке с кнопкой «Скопировать»', () => {
    renderWithProviders(<RecoveryCodeScreen code={CODE} onContinue={() => {}} />)
    const status = screen.getByRole('status')
    expect(status).toBeEmptyDOMElement()
    // Отступ секции не ставится перед пустой строкой: у кнопки и статуса свой общий блок.
    const group = screen.getByRole('button', { name: 'Скопировать' }).parentElement
    expect(group?.children).toHaveLength(2)
    expect(group).toContainElement(status)
  })

  it('«Скопировать» кладёт код в буфер и сообщает об этом', async () => {
    const { user } = renderWithProviders(<RecoveryCodeScreen code={CODE} onContinue={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Скопировать' }))
    expect(await screen.findByText('Код скопирован')).toBeInTheDocument()
    await expect(navigator.clipboard.readText()).resolves.toBe(CODE)
  })

  it('буфер недоступен — код выделяется и подсказка', async () => {
    const { user } = renderWithProviders(<RecoveryCodeScreen code={CODE} onContinue={() => {}} />)
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'))
    await user.click(screen.getByRole('button', { name: 'Скопировать' }))
    expect(await screen.findByText('Выделите код и скопируйте вручную')).toBeInTheDocument()
    expect(window.getSelection()?.toString()).toBe(CODE)
  })

  it('«Продолжить» неактивна без отметки', async () => {
    const onContinue = vi.fn()
    const { user } = renderWithProviders(<RecoveryCodeScreen code={CODE} onContinue={onContinue} />)
    const next = screen.getByRole('button', { name: 'Продолжить' })
    expect(next).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: 'Код сохранён в надёжном месте' }))
    expect(next).toBeEnabled()
    await user.click(next)
    expect(onContinue).toHaveBeenCalledOnce()
  })

  it('пока экран открыт, браузер переспросит при уходе со страницы', () => {
    const { unmount } = renderWithProviders(<RecoveryCodeScreen code={CODE} onContinue={() => {}} />)
    const leaving = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(leaving)
    expect(leaving.defaultPrevented).toBe(true)

    unmount()
    const later = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(later)
    expect(later.defaultPrevented).toBe(false)
  })
})
