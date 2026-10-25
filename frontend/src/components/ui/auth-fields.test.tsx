import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CheckboxField, FormAlert, PasswordField } from '.'

describe('PasswordField', () => {
  it('кнопка показывает и снова скрывает пароль', async () => {
    const user = userEvent.setup()
    render(<PasswordField label="Пароль" defaultValue="secret123" />)
    const input = screen.getByLabelText('Пароль')
    const toggle = screen.getByRole('button', { name: 'Показать пароль' })
    expect(input).toHaveAttribute('type', 'password')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await user.click(toggle)
    expect(input).toHaveAttribute('type', 'text')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await user.click(toggle)
    expect(input).toHaveAttribute('type', 'password')
  })

  it('ошибка связана с полем', () => {
    render(<PasswordField label="Пароль" error="Пароль — не короче 8 символов" />)
    const input = screen.getByLabelText('Пароль')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Пароль — не короче 8 символов')
  })

  it('выключенное поле: недоступны и ввод, и кнопка показа пароля', async () => {
    const user = userEvent.setup()
    render(<PasswordField label="Пароль" defaultValue="secret123" disabled />)
    const input = screen.getByLabelText('Пароль')
    const toggle = screen.getByRole('button', { name: 'Показать пароль' })
    expect(input).toBeDisabled()
    expect(toggle).toBeDisabled()

    await user.click(toggle)
    expect(input).toHaveAttribute('type', 'password')
  })
})

describe('CheckboxField', () => {
  it('отмечается кликом по подписи и пробелом', async () => {
    const user = userEvent.setup()
    render(<CheckboxField label="Код сохранён в надёжном месте" />)
    const checkbox = screen.getByRole('checkbox', { name: 'Код сохранён в надёжном месте' })

    await user.click(screen.getByText('Код сохранён в надёжном месте'))
    expect(checkbox).toBeChecked()

    await user.keyboard(' ')
    expect(checkbox).not.toBeChecked()
  })
})

describe('FormAlert', () => {
  it('показывает текст как alert, без текста — ничего', () => {
    const { rerender } = render(<FormAlert message="Неверный email или пароль." />)
    expect(screen.getByRole('alert')).toHaveTextContent('Неверный email или пароль.')
    rerender(<FormAlert message={null} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
