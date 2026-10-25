import { act, fireEvent, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { apiBaseUrl } from '../../api/base-url'
import { meQuery } from '../../api/queries'
import { AppRoutes } from '../../app/routes'
import { tooManyRequests } from '../../mocks/http-utils'
import { server } from '../../mocks/node'
import { readServer, SEED_PASSWORD } from '../../mocks/server-state'
import { loginMockAs } from '../../mocks/session'
import { renderWithProviders } from '../../test/render'

const owner = () => readServer().accounts.find((item) => item.email === 'owner@example.com')

// Между числом и словом — неразрывный пробел, как в errorMessage; toHaveTextContent заменил бы его обычным.
const TOO_MANY_ATTEMPTS = 'Слишком много попыток. Попробуйте через 15\u00A0минут.'

/** Ворота: запрос держится, пока тест не вызовет release. */
function createGate() {
  let release!: () => void
  const opened = new Promise<void>((resolve) => {
    release = resolve
  })
  return { opened, release }
}

const recover = (recoveryCode: string) =>
  fetch(`${apiBaseUrl()}/auth/recover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@example.com', recovery_code: recoveryCode, new_password: 'another-pass1' }),
  })

function renderProfile() {
  return renderWithProviders(<AppRoutes />, { route: '/profile' })
}

describe('ProfilePage', () => {
  it('данные аккаунта: имя, email, роль', async () => {
    renderProfile()
    expect(await screen.findByRole('heading', { level: 1, name: 'Профиль' })).toBeInTheDocument()
    expect(screen.getByText('Email').nextElementSibling).toHaveTextContent('owner@example.com')
    // «Владелец» есть и в меню пользователя — сверяем значение строки «Роль».
    expect(screen.getByText('Роль').nextElementSibling).toHaveTextContent('Владелец')
  })

  it('имя сохраняется и сразу видно в меню пользователя', async () => {
    const { user } = renderProfile()
    await user.click(await screen.findByRole('button', { name: 'Изменить имя' }))
    const input = screen.getByRole('textbox', { name: 'Имя' })
    await user.clear(input)
    await user.type(input, 'Анна Иванова{Enter}')
    expect(await screen.findByText('Имя сохранено')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Анна Иванова/ }).length).toBeGreaterThan(0)
  })

  it('смена пароля: модалка закрывается, статус, сессия жива', async () => {
    const { user, queryClient } = renderProfile()
    await user.click(await screen.findByRole('button', { name: 'Сменить пароль' }))
    const dialog = screen.getByRole('dialog', { name: 'Смена пароля' })
    await user.type(within(dialog).getByLabelText('Текущий пароль'), SEED_PASSWORD)
    await user.type(within(dialog).getByLabelText('Новый пароль'), 'newsecret1')
    await user.type(within(dialog).getByLabelText('Повтор пароля'), 'newsecret1')
    await user.click(within(dialog).getByRole('button', { name: 'Сменить пароль' }))

    expect(await screen.findByText('Пароль изменён. Другие сессии завершены.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Повтор пароля')).not.toBeInTheDocument()
    expect(owner()?.password).toBe('newsecret1')

    await act(() => queryClient.invalidateQueries())
    expect(screen.getByRole('heading', { level: 1, name: 'Профиль' })).toBeInTheDocument()
    expect(screen.queryByText('Сессия истекла — войдите снова')).not.toBeInTheDocument()
  })

  it('смена пароля: неверный текущий — ошибка у поля, модалка открыта', async () => {
    const { user } = renderProfile()
    await user.click(await screen.findByRole('button', { name: 'Сменить пароль' }))
    const dialog = screen.getByRole('dialog', { name: 'Смена пароля' })
    await user.type(within(dialog).getByLabelText('Текущий пароль'), 'wrong-pass')
    await user.type(within(dialog).getByLabelText('Новый пароль'), 'newsecret1')
    await user.type(within(dialog).getByLabelText('Повтор пароля'), 'newsecret1')
    await user.click(within(dialog).getByRole('button', { name: 'Сменить пароль' }))
    expect(await within(dialog).findByText('Неверный текущий пароль.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Текущий пароль')).toHaveFocus()
  })

  it('смена пароля: 429 — «Слишком много попыток», модалка открыта', async () => {
    server.use(http.post('*/api/auth/change-password', () => tooManyRequests(900)))
    const { user } = renderProfile()
    await user.click(await screen.findByRole('button', { name: 'Сменить пароль' }))
    const dialog = screen.getByRole('dialog', { name: 'Смена пароля' })
    await user.type(within(dialog).getByLabelText('Текущий пароль'), SEED_PASSWORD)
    await user.type(within(dialog).getByLabelText('Новый пароль'), 'newsecret1')
    await user.type(within(dialog).getByLabelText('Повтор пароля'), 'newsecret1')
    await user.click(within(dialog).getByRole('button', { name: 'Сменить пароль' }))

    expect((await within(dialog).findByRole('alert')).textContent).toBe(TOO_MANY_ATTEMPTS)
    expect(dialog).toHaveAttribute('open')
    expect(within(dialog).getByLabelText('Повтор пароля')).toBeInTheDocument()
  })

  it('смена пароля: после «Отмена» форма открывается пустой', async () => {
    const { user } = renderProfile()
    await user.click(await screen.findByRole('button', { name: 'Сменить пароль' }))
    const dialog = screen.getByRole('dialog', { name: 'Смена пароля' })
    await user.type(within(dialog).getByLabelText('Текущий пароль'), 'half-typed')
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByRole('dialog', { name: 'Смена пароля' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Сменить пароль' }))
    const reopened = screen.getByRole('dialog', { name: 'Смена пароля' })
    expect(within(reopened).getByLabelText('Текущий пароль')).toHaveValue('')
  })

  it('смена пароля: поздний ответ после «Отмена» не закрывает другое открытое окно', async () => {
    const gate = createGate()
    const realFetch = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.endsWith('/auth/change-password')) await gate.opened
      return realFetch(input, init)
    })
    const { user } = renderProfile()
    await user.click(await screen.findByRole('button', { name: 'Сменить пароль' }))
    const dialog = screen.getByRole('dialog', { name: 'Смена пароля' })
    await user.type(within(dialog).getByLabelText('Текущий пароль'), SEED_PASSWORD)
    await user.type(within(dialog).getByLabelText('Новый пароль'), 'newsecret1')
    await user.type(within(dialog).getByLabelText('Повтор пароля'), 'newsecret1')
    await user.click(within(dialog).getByRole('button', { name: 'Сменить пароль' }))
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    await user.click(screen.getByRole('button', { name: 'Новый код восстановления' }))
    const codeDialog = screen.getByRole('dialog', { name: 'Новый код восстановления' })

    gate.release()
    expect(await screen.findByText('Пароль изменён. Другие сессии завершены.')).toBeInTheDocument()
    expect(codeDialog).toHaveAttribute('open')
  })

  it('новый код: пароль → код; пока код на экране, окно не закрыть; старый код больше не действует', async () => {
    const { user } = renderProfile()
    await user.click(await screen.findByRole('button', { name: 'Новый код восстановления' }))
    const dialog = screen.getByRole('dialog', { name: 'Новый код восстановления' })
    expect(within(dialog).getByText('Старый код перестанет действовать. Подтвердите действие паролем.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Текущий пароль')).toHaveFocus()
    await user.type(within(dialog).getByLabelText('Текущий пароль'), SEED_PASSWORD)
    await user.click(within(dialog).getByRole('button', { name: 'Получить новый код' }))

    // Экран кода монтируется позже открытия окна и сам ставит фокус на заголовок.
    const heading = await within(dialog).findByRole('heading', { level: 3, name: 'Сохраните код восстановления' })
    expect(heading).toHaveFocus()
    // Отступ сверху нужен под заголовком карточки входа, в окне он лишний.
    expect(heading.closest('section')).toHaveClass('mt-0')
    expect(heading.closest('section')).not.toHaveClass('mt-6')
    const code = owner()?.recovery_code ?? ''
    expect(code).not.toBe('K7QM-2XPA-9RTD-4WNB')
    expect(within(dialog).getByText(code)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(dialog).toHaveAttribute('open')

    await user.click(within(dialog).getByRole('checkbox', { name: 'Код сохранён в надёжном месте' }))
    await user.click(within(dialog).getByRole('button', { name: 'Готово' }))
    expect(await screen.findByText('Новый код сохранён. Старый больше не действует.')).toBeInTheDocument()

    expect((await recover('K7QM-2XPA-9RTD-4WNB')).status).toBe(400)
    expect((await recover(code)).status).toBe(200)
  })

  it('новый код: неверный пароль — ошибка у поля', async () => {
    const { user } = renderProfile()
    await user.click(await screen.findByRole('button', { name: 'Новый код восстановления' }))
    const dialog = screen.getByRole('dialog', { name: 'Новый код восстановления' })
    await user.type(within(dialog).getByLabelText('Текущий пароль'), 'wrong-pass')
    await user.click(within(dialog).getByRole('button', { name: 'Получить новый код' }))
    expect(await within(dialog).findByText('Неверный текущий пароль.')).toBeInTheDocument()
    expect(owner()?.recovery_code).toBe('K7QM-2XPA-9RTD-4WNB')
    // После ошибки окно снова можно закрыть.
    expect(within(dialog).getByRole('button', { name: 'Закрыть' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Отмена' })).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('новый код: 429 — «Слишком много попыток», окно открыто, код прежний', async () => {
    server.use(http.post('*/api/users/me/recovery-code', () => tooManyRequests(900)))
    const { user } = renderProfile()
    await user.click(await screen.findByRole('button', { name: 'Новый код восстановления' }))
    const dialog = screen.getByRole('dialog', { name: 'Новый код восстановления' })
    await user.type(within(dialog).getByLabelText('Текущий пароль'), SEED_PASSWORD)
    await user.click(within(dialog).getByRole('button', { name: 'Получить новый код' }))

    expect((await within(dialog).findByRole('alert')).textContent).toBe(TOO_MANY_ATTEMPTS)
    expect(dialog).toHaveAttribute('open')
    expect(within(dialog).getByLabelText('Текущий пароль')).toBeInTheDocument()
    expect(owner()?.recovery_code).toBe('K7QM-2XPA-9RTD-4WNB')
  })

  it('новый код: пока запрос идёт, окно не закрыть; ответ показывает код', async () => {
    const gate = createGate()
    server.use(
      http.post('*/api/users/me/recovery-code', async () => {
        await gate.opened
        return HttpResponse.json({ recovery_code: 'AAAA-BBBB-CCCC-DDDD' })
      }),
    )
    const { user } = renderProfile()
    await user.click(await screen.findByRole('button', { name: 'Новый код восстановления' }))
    const dialog = screen.getByRole('dialog', { name: 'Новый код восстановления' })
    expect(within(dialog).getByRole('button', { name: 'Закрыть' })).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Текущий пароль'), SEED_PASSWORD)
    await user.click(within(dialog).getByRole('button', { name: 'Получить новый код' }))

    // Код сервер уже заменит, а закрытое окно его не покажет — до ответа окно не закрывается ничем.
    const cancel = within(dialog).getByRole('button', { name: 'Отмена' })
    expect(cancel).toHaveAttribute('aria-disabled', 'true')
    expect(within(dialog).queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    fireEvent.click(dialog)
    await user.click(cancel)
    expect(dialog).toHaveAttribute('open')

    gate.release()
    expect(
      await within(dialog).findByRole('heading', { level: 3, name: 'Сохраните код восстановления' }),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('AAAA-BBBB-CCCC-DDDD')).toBeInTheDocument()
  })

  it('новый код: запрос завис — по таймауту «Нет связи», окно снова закрывается', async () => {
    const gate = createGate()
    server.use(
      http.post('*/api/users/me/recovery-code', async () => {
        await gate.opened
        return HttpResponse.json({ recovery_code: 'AAAA-BBBB-CCCC-DDDD' })
      }),
    )
    const { user } = renderProfile()
    await user.click(await screen.findByRole('button', { name: 'Новый код восстановления' }))
    const dialog = screen.getByRole('dialog', { name: 'Новый код восстановления' })
    await user.type(within(dialog).getByLabelText('Текущий пароль'), SEED_PASSWORD)
    // Подменяем только перед отправкой: обмен токена при загрузке берёт свой таймаут.
    const controller = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    await user.click(within(dialog).getByRole('button', { name: 'Получить новый код' }))
    expect(within(dialog).getByRole('button', { name: 'Отмена' })).toHaveAttribute('aria-disabled', 'true')

    controller.abort(new DOMException('Истекло время', 'TimeoutError'))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    )
    expect(within(dialog).getByRole('button', { name: 'Отмена' })).not.toHaveAttribute('aria-disabled', 'true')
    expect(within(dialog).getByRole('button', { name: 'Закрыть' })).toBeInTheDocument()
    gate.release()
  })

  it('новый код стирается после «Готово»: повторное открытие снова просит пароль', async () => {
    const { user } = renderProfile()
    await user.click(await screen.findByRole('button', { name: 'Новый код восстановления' }))
    const dialog = screen.getByRole('dialog', { name: 'Новый код восстановления' })
    await user.type(within(dialog).getByLabelText('Текущий пароль'), SEED_PASSWORD)
    await user.click(within(dialog).getByRole('button', { name: 'Получить новый код' }))
    await within(dialog).findByRole('heading', { level: 3, name: 'Сохраните код восстановления' })
    const code = owner()?.recovery_code ?? ''
    await user.click(within(dialog).getByRole('checkbox', { name: 'Код сохранён в надёжном месте' }))
    await user.click(within(dialog).getByRole('button', { name: 'Готово' }))
    expect(await screen.findByText('Новый код сохранён. Старый больше не действует.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Новый код восстановления' }))
    const reopened = screen.getByRole('dialog', { name: 'Новый код восстановления' })
    expect(within(reopened).getByLabelText('Текущий пароль')).toHaveValue('')
    expect(within(reopened).queryByRole('heading', { name: 'Сохраните код восстановления' })).not.toBeInTheDocument()
    expect(within(reopened).queryByText(code)).not.toBeInTheDocument()
    // Старое сообщение не висит, пока открыто новое окно.
    expect(screen.queryByText('Новый код сохранён. Старый больше не действует.')).not.toBeInTheDocument()
  })

  it('у клиники нет кнопки нового кода', async () => {
    loginMockAs('clinic')
    renderProfile()
    expect(await screen.findByRole('button', { name: 'Сменить пароль' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Новый код восстановления' })).not.toBeInTheDocument()
  })

  it('«Выйти» в меню: экран входа, данные пользователя из кэша убраны', async () => {
    const { user, queryClient } = renderProfile()
    await screen.findByRole('heading', { level: 1, name: 'Профиль' })
    await user.click(screen.getAllByRole('button', { name: /меню пользователя/i })[0])
    await user.click(await screen.findByRole('button', { name: 'Выйти' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Вход' })).toBeInTheDocument()
    expect(queryClient.getQueryData(meQuery.queryKey)).toBeUndefined()
  })
})
