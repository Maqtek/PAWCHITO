import { screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { readServer, SEED_PASSWORD, updateServer } from '../../mocks/server-state'
import { loginMockAs, logoutMock } from '../../mocks/session'
import { recordRequests, settle } from '../../test/requests'
import { renderRoute } from '../../test/route'
import { TOO_MANY_ATTEMPTS } from '../../test/texts'

async function submit(user: UserEvent, { current, next, repeat = next }: { current: string; next: string; repeat?: string }) {
  await user.type(await screen.findByLabelText('Временный пароль'), current)
  await user.type(screen.getByLabelText('Новый пароль'), next)
  await user.type(screen.getByLabelText('Повтор пароля'), repeat)
  await user.click(screen.getByRole('button', { name: 'Сменить пароль' }))
}

beforeEach(() => {
  loginMockAs('clinic-new@example.com')
})

describe('ChangePasswordPage', () => {
  it('клиника с временным паролем: смена пароля, потом её записи', async () => {
    const { user } = renderRoute('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Смена пароля' })).toBeInTheDocument()
    expect(screen.getByText('Администратор выдал временный пароль. Придумайте новый, чтобы продолжить.')).toBeInTheDocument()

    await submit(user, { current: SEED_PASSWORD, next: 'newsecret1' })

    expect(await screen.findByRole('heading', { level: 1, name: 'Записи' })).toBeInTheDocument()
    const account = readServer().accounts.find((item) => item.email === 'clinic-new@example.com')
    expect(account).toMatchObject({ password: 'newsecret1', must_change_password: false })
  })

  it('неверный временный пароль — ошибка у поля, фокус на нём', async () => {
    const { user } = renderRoute('/change-password')
    await submit(user, { current: 'wrong-pass', next: 'newsecret1' })
    expect(await screen.findByText('Неверный текущий пароль.')).toBeInTheDocument()
    expect(screen.getByLabelText('Временный пароль')).toHaveFocus()
  })

  it('пауза после 5 неудач — «Слишком много попыток» над кнопкой, форма на месте', async () => {
    // Как после пяти неверных паролей: мок сам отвечает 429 с Retry-After.
    updateServer((state) => {
      state.attempts['clinic-new@example.com'] = { failures: 0, lockedUntil: Date.now() + 15 * 60_000 }
    })
    const { user } = renderRoute('/change-password')
    await submit(user, { current: SEED_PASSWORD, next: 'newsecret1' })
    // Между числом и словом — неразрывный пробел, как в errorMessage; toHaveTextContent заменил бы его обычным.
    expect((await screen.findByRole('alert')).textContent).toBe(TOO_MANY_ATTEMPTS)
    expect(screen.getByRole('heading', { level: 1, name: 'Смена пароля' })).toBeInTheDocument()
    expect(screen.getByLabelText('Временный пароль')).toHaveValue(SEED_PASSWORD)
  })

  it('повтор не совпал — ошибка без запроса', async () => {
    const changes = recordRequests('post', '*/api/auth/change-password')
    const { user } = renderRoute('/change-password')
    await submit(user, { current: SEED_PASSWORD, next: 'newsecret1', repeat: 'newsecret2' })
    expect(screen.getByText('Пароли не совпадают')).toBeInTheDocument()
    await settle()
    expect(changes.count).toBe(0)
  })

  it('«Выйти» — на экран входа', async () => {
    const { user } = renderRoute('/change-password')
    await user.click(await screen.findByRole('button', { name: 'Выйти' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Вход' })).toBeInTheDocument()
  })

  it('без временного пароля — главная роли', async () => {
    loginMockAs('owner')
    renderRoute('/change-password')
    expect(await screen.findByRole('heading', { level: 1, name: /Анна Смирнова/ })).toBeInTheDocument()
  })

  it('гость — экран входа', async () => {
    logoutMock()
    renderRoute('/change-password')
    expect(await screen.findByRole('heading', { level: 1, name: 'Вход' })).toBeInTheDocument()
  })
})
