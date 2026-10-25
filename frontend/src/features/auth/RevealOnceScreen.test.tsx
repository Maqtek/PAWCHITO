import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/render'
import { RevealOnceScreen } from './RevealOnceScreen'

function renderReveal(onContinue = vi.fn()) {
  const result = renderWithProviders(
    <RevealOnceScreen
      secret="vT4q-9mKx-2Lpe"
      heading="Временный пароль клиники"
      note="Передайте пароль клинике."
      confirmLabel="Пароль передан клинике"
      copiedText="Пароль скопирован"
      manualText="Выделите пароль и скопируйте вручную"
      continueLabel="Готово"
      onContinue={onContinue}
    />,
  )
  return { ...result, onContinue }
}

describe('RevealOnceScreen', () => {
  it('тексты из пропсов; фокус на заголовке; «Готово» только после отметки', async () => {
    const { user, onContinue } = renderReveal()
    expect(screen.getByRole('heading', { level: 2, name: 'Временный пароль клиники' })).toHaveFocus()
    expect(screen.getByText('vT4q-9mKx-2Lpe')).toBeInTheDocument()
    expect(screen.getByText('Передайте пароль клинике.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Готово' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Пароль передан клинике' }))
    await user.click(screen.getByRole('button', { name: 'Готово' }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('копирование — свой текст статуса', async () => {
    const { user } = renderReveal()
    await user.click(screen.getByRole('button', { name: 'Скопировать' }))
    expect(await screen.findByText('Пароль скопирован')).toBeInTheDocument()
  })
})
