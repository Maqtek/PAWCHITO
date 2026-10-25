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
