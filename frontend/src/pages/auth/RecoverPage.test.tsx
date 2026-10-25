import { screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { logoutMock } from '../../mocks/session'
import { renderWithProviders } from '../../test/render'
import { LoginPage } from './LoginPage'
import { RecoverPage } from './RecoverPage'

function renderRecover() {
  return renderWithProviders(
    <Routes>
      <Route path="/recover" element={<RecoverPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<p>Главная владельца</p>} />
    </Routes>,
    { route: '/recover' },
  )
}

async function fill(user: UserEvent, values: { email: string; code: string; password: string; repeat: string }) {
  await user.type(await screen.findByLabelText('Email'), values.email)
  await user.type(screen.getByLabelText('Код восстановления'), values.code)
  await user.type(screen.getByLabelText('Новый пароль'), values.password)
  await user.type(screen.getByLabelText('Повтор пароля'), values.repeat)
  await user.click(screen.getByRole('button', { name: 'Восстановить доступ' }))
}

beforeEach(() => {
  logoutMock()
})

describe('RecoverPage', () => {
  it('код не в формате — проверка без запроса', async () => {
    const { user } = renderRecover()
    await fill(user, { email: 'owner@example.com', code: 'abc', password: 'newsecret1', repeat: 'newsecret1' })
    expect(screen.getByText('Код в формате XXXX-XXXX-XXXX-XXXX')).toBeInTheDocument()
    expect(screen.getByLabelText('Код восстановления')).toHaveFocus()
  })

  it('неверный код — текст над кнопкой', async () => {
    const { user } = renderRecover()
    await fill(user, { email: 'owner@example.com', code: 'AAAA-AAAA-AAAA-AAAA', password: 'newsecret1', repeat: 'newsecret1' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный email или код.')
  })

  it('код строчными без дефисов; успех → новый код → вход с email и сообщением → вход новым паролем', async () => {
    const { user } = renderRecover()
    await fill(user, { email: 'owner@example.com', code: 'k7qm2xpa9rtd4wnb', password: 'newsecret1', repeat: 'newsecret1' })

    expect(await screen.findByRole('heading', { name: 'Сохраните код восстановления' })).toBeInTheDocument()
    const code = screen.getByText(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/)
    expect(code).not.toHaveTextContent('K7QM-2XPA-9RTD-4WNB')

    await user.click(screen.getByRole('checkbox', { name: 'Код сохранён в надёжном месте' }))
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))

    expect(await screen.findByText('Пароль изменён — войдите с новым паролем')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('owner@example.com')

    await user.type(screen.getByLabelText('Пароль'), 'newsecret1')
    await user.click(screen.getByRole('button', { name: 'Войти' }))
    expect(await screen.findByText('Главная владельца')).toBeInTheDocument()
  })
})
