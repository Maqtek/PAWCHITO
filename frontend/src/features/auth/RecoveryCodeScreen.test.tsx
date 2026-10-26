import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/render'
import { RecoveryCodeScreen } from './RecoveryCodeScreen'

const CODE = 'K7QM-2XPA-9RTD-4WNB'

// Общее поведение экрана — перенос по группам, строка статуса, выделение без буфера, предупреждение при уходе —
// проверяет RevealOnceScreen.test.tsx; здесь — тексты кода восстановления и пропсы, которые экран передаёт дальше.
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

  it('буфер недоступен — подсказка про код', async () => {
    const { user } = renderWithProviders(<RecoveryCodeScreen code={CODE} onContinue={() => {}} />)
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'))
    await user.click(screen.getByRole('button', { name: 'Скопировать' }))
    expect(await screen.findByText('Выделите код и скопируйте вручную')).toBeInTheDocument()
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

  it('в модалке: заголовок h3 и своя подпись кнопки', async () => {
    const onContinue = vi.fn()
    const { user } = renderWithProviders(
      <RecoveryCodeScreen code="K7QM-2XPA-9RTD-4WNB" onContinue={onContinue} headingLevel="h3" continueLabel="Готово" />,
    )
    expect(screen.getByRole('heading', { level: 3, name: 'Сохраните код восстановления' })).toHaveFocus()
    await user.click(screen.getByRole('checkbox', { name: 'Код сохранён в надёжном месте' }))
    await user.click(screen.getByRole('button', { name: 'Готово' }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })
})
