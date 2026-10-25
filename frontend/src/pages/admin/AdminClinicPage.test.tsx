import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../app/routes'
import { server } from '../../mocks/node'
import { readServer, SEED_PASSWORD, toAdminClinic, updateServer, type MockAccount } from '../../mocks/server-state'
import { loginMockAs } from '../../mocks/session'
import { renderWithProviders } from '../../test/render'

beforeEach(() => {
  loginMockAs('admin')
})

/** Показывает state текущей записи истории: так видно, что страница убрала из него сообщение. */
function LocationStateProbe() {
  // Не output: у него неявная роль status, и проба спутается с регионом статуса страницы.
  return <span data-testid="location-state">{JSON.stringify(useLocation().state)}</span>
}

const renderClinic = (id: number | string, state?: unknown) =>
  renderWithProviders(
    <>
      <AppRoutes />
      <LocationStateProbe />
    </>,
    { route: `/admin/clinics/${id}`, state },
  )

/** role="status" есть и у спиннеров, поэтому статус страницы ищем по тексту и проверяем, что он в live-регионе. */
async function findStatus(text: string) {
  const message = await screen.findByText(text)
  expect(message.closest('[role="status"]')).not.toBeNull()
  return message
}

/** Ворота: запрос держится, пока тест не вызовет release. */
function createGate() {
  let release!: () => void
  const opened = new Promise<void>((resolve) => {
    release = resolve
  })
  return { opened, release }
}

const NETWORK = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'
const CREATED = 'Клиника добавлена. Создайте аккаунт, чтобы клиника могла войти.'

/** Аккаунт клиники 4, созданный в обход страницы: другим администратором или запросом, ответ которого не дошёл. */
function addZoovetAccount(email: string) {
  updateServer((state) => {
    const account: MockAccount = {
      id: state.nextUserId,
      email,
      password: SEED_PASSWORD,
      role: 'clinic',
      full_name: 'Зоовет',
      must_change_password: true,
      is_active: true,
      recovery_code: null,
      clinic_id: 4,
    }
    state.nextUserId += 1
    state.accounts.push(account)
  })
}

async function savePhone(user: ReturnType<typeof renderClinic>['user'], phone: string) {
  await user.click(await screen.findByRole('button', { name: 'Изменить' }))
  const dialog = screen.getByRole('dialog', { name: 'Изменить клинику' })
  await user.clear(within(dialog).getByLabelText('Телефон'))
  await user.type(within(dialog).getByLabelText('Телефон'), phone)
  await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
}

describe('AdminClinicPage: данные', () => {
  it('название, адрес, телефон, часы, дни; ссылка на все клиники', async () => {
    renderClinic(2)
    expect(await screen.findByRole('heading', { level: 1, name: 'ВетДоктор' })).toBeInTheDocument()
    expect(screen.getByText('ул. Ленина, 10')).toBeInTheDocument()
    expect(screen.getByText('+7 999 000-00-00')).toBeInTheDocument()
    expect(screen.getByText('09:00–20:00')).toBeInTheDocument()
    expect(screen.getByText('Пн–Сб')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Все клиники' })).toHaveAttribute('href', '/admin/clinics')
  })

  it('изменение: модалка, сохранение, статус и новые данные', async () => {
    const { user } = renderClinic(2)
    await savePhone(user, '89991234567')
    await findStatus('Данные клиники сохранены.')
    expect(screen.getByText('+7 999 123-45-67')).toBeInTheDocument()
  })

  it('открытие формы убирает прошлое сообщение, следующее сохранение объявляется заново', async () => {
    const { user } = renderClinic(2)
    await savePhone(user, '89991234567')
    await findStatus('Данные клиники сохранены.')

    await user.click(screen.getByRole('button', { name: 'Изменить' }))
    expect(screen.queryByText('Данные клиники сохранены.')).not.toBeInTheDocument()
    const dialog = screen.getByRole('dialog', { name: 'Изменить клинику' })
    await user.clear(within(dialog).getByLabelText('Телефон'))
    await user.type(within(dialog).getByLabelText('Телефон'), '89990000001')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    await findStatus('Данные клиники сохранены.')
    expect(screen.getByText('+7 999 000-00-01')).toBeInTheDocument()
  })

  it('после добавления — статус из state', async () => {
    renderClinic(4, { notice: 'created' })
    await findStatus('Клиника добавлена. Создайте аккаунт, чтобы клиника могла войти.')
  })

  it('сообщение из state убирается из истории, а на экране остаётся', async () => {
    renderClinic(4, { notice: 'created' })
    expect(screen.getByTestId('location-state')).toHaveTextContent('"notice":"created"')

    await findStatus('Клиника добавлена. Создайте аккаунт, чтобы клиника могла войти.')
    await waitFor(() => expect(screen.getByTestId('location-state')).toHaveTextContent(/^null$/))
    expect(screen.getByText('Клиника добавлена. Создайте аккаунт, чтобы клиника могла войти.')).toBeInTheDocument()
  })

  it('регион статуса есть уже при загрузке: тот же узел получает сообщение', async () => {
    renderClinic(4, { notice: 'created' })
    await screen.findByText('Загружаем клинику')
    const region = screen.getAllByRole('status').find((element) => element.tagName === 'P')
    expect(region).toBeDefined()
    expect(region).toBeEmptyDOMElement()

    expect(await screen.findByRole('heading', { level: 1, name: 'Зоовет' })).toBeInTheDocument()
    expect(region).toBeInTheDocument()
    // Текст приходит следующим рендером после данных.
    await waitFor(() => expect(region).toHaveTextContent(CREATED))
  })

  it('переход из списка после добавления (данные уже в кэше): регион статуса пустой, затем тот же узел получает сообщение', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: '/admin/clinics' })
    await user.click(await screen.findByRole('button', { name: 'Добавить клинику' }))
    const dialog = screen.getByRole('dialog', { name: 'Новая клиника' })
    await user.type(within(dialog).getByLabelText('Название'), 'Лапа')
    await user.type(within(dialog).getByLabelText('Адрес'), 'ул. Мира, 1')
    await user.type(within(dialog).getByLabelText('Телефон'), '89997778899')

    // Регион, вставленный уже с текстом, скринридер не озвучит: текст должен прийти в существующий узел.
    const records: MutationRecord[] = []
    const observer = new MutationObserver((list) => records.push(...list))
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    await user.click(within(dialog).getByRole('button', { name: 'Добавить клинику' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Лапа' })).toBeInTheDocument()
    const message = await findStatus(CREATED)
    records.push(...observer.takeRecords())
    observer.disconnect()

    expect(screen.queryByText('Загружаем клинику')).not.toBeInTheDocument()
    const region = message.closest('[role="status"]')
    const textArrived = records.some(
      (record) =>
        (record.target === region && [...record.addedNodes].some((node) => node.textContent === CREATED)) ||
        (record.type === 'characterData' && record.target.parentNode === region),
    )
    expect(textArrived).toBe(true)
  })

  it('скрытая клиника — метка «Скрыта»', async () => {
    renderClinic(5)
    expect(await screen.findByRole('heading', { level: 1, name: 'Айболит' })).toBeInTheDocument()
    expect(screen.getByText('Скрыта')).toBeInTheDocument()
  })

  it.each([999, 'abc', '2.0', '0x2', '0', '1234567890'])('клиника %s не найдена — ссылка на список', async (id) => {
    renderClinic(id)
    expect(await screen.findByRole('heading', { name: 'Клиника не найдена' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'К списку клиник' })).toHaveAttribute('href', '/admin/clinics')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('сбой загрузки — сообщение и повтор запроса', async () => {
    server.use(
      http.get('*/api/admin/clinics/:id', () => HttpResponse.json({ detail: 'Ошибка' }, { status: 500 }), {
        once: true,
      }),
    )
    const { user } = renderClinic(2)
    expect(await screen.findByRole('heading', { name: 'Не удалось загрузить клинику' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()

    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'ВетДоктор' })).toBeInTheDocument()
  })
})

describe('AdminClinicPage: аккаунт клиники', () => {
  it('создание: email → временный пароль; окно не закрыть до «Готово»; статус и email в карточке', async () => {
    const { user } = renderClinic(4)
    expect(await screen.findByText('Клиника не может войти, пока нет аккаунта.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }))
    const dialog = screen.getByRole('dialog', { name: 'Аккаунт клиники' })
    await user.type(within(dialog).getByLabelText('Email клиники'), 'zoovet@example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Создать аккаунт' }))

    expect(await within(dialog).findByRole('heading', { level: 3, name: 'Временный пароль клиники' })).toBeInTheDocument()
    const password = readServer().accounts.find((item) => item.email === 'zoovet@example.com')?.password ?? ''
    expect(within(dialog).getByText(password)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(dialog).toHaveAttribute('open')

    await user.click(within(dialog).getByRole('checkbox', { name: 'Пароль передан клинике' }))
    await user.click(within(dialog).getByRole('button', { name: 'Готово' }))
    expect(await screen.findByText('Аккаунт создан. Временный пароль передан клинике.')).toBeInTheDocument()
    expect(await screen.findByText('zoovet@example.com')).toBeInTheDocument()
    expect(screen.getByText('Активен')).toBeInTheDocument()
    // Кнопки «Создать аккаунт» больше нет — фокус на заголовке карточки, а не на body.
    expect(screen.getByRole('heading', { name: 'Аккаунт клиники' })).toHaveFocus()
  })

  it('409 — у поля email, фокус на нём', async () => {
    const { user } = renderClinic(4)
    await user.click(await screen.findByRole('button', { name: 'Создать аккаунт' }))
    const dialog = screen.getByRole('dialog', { name: 'Аккаунт клиники' })
    await user.type(within(dialog).getByLabelText('Email клиники'), 'owner@example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Создать аккаунт' }))
    expect(await within(dialog).findByText('У клиники уже есть аккаунт или email занят.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Email клиники')).toHaveFocus()
  })

  it('409: аккаунт уже создал другой администратор — карточка перечитана, после закрытия окна доступен сброс', async () => {
    const { user } = renderClinic(4)
    expect(await screen.findByText('Клиника не может войти, пока нет аккаунта.')).toBeInTheDocument()
    addZoovetAccount('zoovet-other@example.com')
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }))
    const dialog = screen.getByRole('dialog', { name: 'Аккаунт клиники' })
    await user.type(within(dialog).getByLabelText('Email клиники'), 'zoovet@example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Создать аккаунт' }))

    expect(await within(dialog).findByText('У клиники уже есть аккаунт или email занят.')).toBeInTheDocument()
    expect(await screen.findByText('zoovet-other@example.com')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }))
    expect(dialog).not.toHaveAttribute('open')
    expect(screen.getByRole('button', { name: 'Сбросить пароль' })).toBeInTheDocument()
    // Кнопка, открывшая окно, исчезла — фокус на заголовке карточки.
    expect(screen.getByRole('heading', { name: 'Аккаунт клиники' })).toHaveFocus()
  })

  it('пока создаётся аккаунт, окно не закрыть; ответ показывает пароль', async () => {
    const gate = createGate()
    server.use(
      http.post('*/api/admin/clinics/:id/account', async () => {
        await gate.opened
        return HttpResponse.json(
          {
            user: { id: 50, email: 'zoovet@example.com', role: 'clinic', full_name: 'Зоовет', must_change_password: true },
            temporary_password: 'abcd-efgh-jkmn',
          },
          { status: 201 },
        )
      }),
    )
    const { user } = renderClinic(4)
    await user.click(await screen.findByRole('button', { name: 'Создать аккаунт' }))
    const dialog = screen.getByRole('dialog', { name: 'Аккаунт клиники' })
    await user.type(within(dialog).getByLabelText('Email клиники'), 'zoovet@example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Создать аккаунт' }))
    expect(await within(dialog).findByRole('button', { name: 'Создаём…' })).toBeInTheDocument()

    expect(within(dialog).queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    const cancel = within(dialog).getByRole('button', { name: 'Отмена' })
    expect(cancel).toHaveAttribute('aria-disabled', 'true')
    await user.click(cancel)
    expect(dialog).toHaveAttribute('open')

    gate.release()
    expect(await within(dialog).findByRole('heading', { level: 3, name: 'Временный пароль клиники' })).toBeInTheDocument()
    expect(within(dialog).getByText('abcd-efgh-jkmn')).toBeInTheDocument()
  })

  it('пока сбрасывается пароль, окно не закрыть; ответ показывает пароль', async () => {
    const gate = createGate()
    server.use(
      http.post('*/api/admin/clinics/:id/account/reset-password', async () => {
        await gate.opened
        return HttpResponse.json({ temporary_password: 'abcd-efgh-jkmn' })
      }),
    )
    const { user } = renderClinic(2)
    await user.click(await screen.findByRole('button', { name: 'Сбросить пароль' }))
    const dialog = screen.getByRole('dialog', { name: 'Сброс пароля' })
    await user.click(within(dialog).getByRole('button', { name: 'Сбросить пароль' }))
    expect(await within(dialog).findByRole('button', { name: 'Сбрасываем…' })).toBeInTheDocument()

    expect(within(dialog).queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    const cancel = within(dialog).getByRole('button', { name: 'Отмена' })
    expect(cancel).toHaveAttribute('aria-disabled', 'true')
    await user.click(cancel)
    expect(dialog).toHaveAttribute('open')

    gate.release()
    expect(await within(dialog).findByRole('heading', { level: 3, name: 'Временный пароль клиники' })).toBeInTheDocument()
    expect(within(dialog).getByText('abcd-efgh-jkmn')).toBeInTheDocument()
  })

  it('создание аккаунта: запрос завис — по таймауту «Нет связи», окно снова закрывается, карточка перечитана', async () => {
    const gate = createGate()
    let arrived!: () => void
    const reached = new Promise<void>((resolve) => {
      arrived = resolve
    })
    server.use(
      http.post('*/api/admin/clinics/:id/account', async () => {
        // Сервер успел создать аккаунт, а ответ не пришёл вовремя.
        addZoovetAccount('zoovet@example.com')
        arrived()
        await gate.opened
        return HttpResponse.json({ detail: 'Поздно' }, { status: 500 })
      }),
    )
    const { user } = renderClinic(4)
    await user.click(await screen.findByRole('button', { name: 'Создать аккаунт' }))
    const dialog = screen.getByRole('dialog', { name: 'Аккаунт клиники' })
    await user.type(within(dialog).getByLabelText('Email клиники'), 'zoovet@example.com')
    // Подменяем только перед отправкой: обмен токена при загрузке берёт свой таймаут.
    const controller = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    await user.click(within(dialog).getByRole('button', { name: 'Создать аккаунт' }))
    expect(within(dialog).getByRole('button', { name: 'Отмена' })).toHaveAttribute('aria-disabled', 'true')
    await reached

    controller.abort(new DOMException('Истекло время', 'TimeoutError'))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(NETWORK)
    expect(within(dialog).getByRole('button', { name: 'Отмена' })).not.toHaveAttribute('aria-disabled', 'true')
    expect(within(dialog).getByRole('button', { name: 'Закрыть' })).toBeInTheDocument()
    expect(await screen.findByText('zoovet@example.com')).toBeInTheDocument()
    gate.release()
  })

  it('сброс пароля: кнопка сброса на месте — после «Готово» фокус не уводится на заголовок', async () => {
    const { user } = renderClinic(2)
    const opener = await screen.findByRole('button', { name: 'Сбросить пароль' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Сброс пароля' })
    await user.click(within(dialog).getByRole('button', { name: 'Сбросить пароль' }))
    await within(dialog).findByRole('heading', { level: 3, name: 'Временный пароль клиники' })
    await user.click(within(dialog).getByRole('checkbox', { name: 'Пароль передан клинике' }))
    await user.click(within(dialog).getByRole('button', { name: 'Готово' }))
    expect(await screen.findByText('Пароль сброшен. Временный пароль передан клинике.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Аккаунт клиники' })).not.toHaveFocus()
  })

  it('сброс пароля: подтверждение → временный пароль → статус; на сервере новый пароль и флаг смены', async () => {
    const { user } = renderClinic(2)
    await user.click(await screen.findByRole('button', { name: 'Сбросить пароль' }))
    const dialog = screen.getByRole('dialog', { name: 'Сброс пароля' })
    expect(within(dialog).getByText('Клиника выйдет на всех устройствах и при входе задаст новый пароль.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Сбросить пароль' }))
    expect(await within(dialog).findByRole('heading', { level: 3, name: 'Временный пароль клиники' })).toBeInTheDocument()
    const account = readServer().accounts.find((item) => item.id === 6)
    expect(account?.must_change_password).toBe(true)
    expect(within(dialog).getByText(account?.password ?? '')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('checkbox', { name: 'Пароль передан клинике' }))
    await user.click(within(dialog).getByRole('button', { name: 'Готово' }))
    expect(await screen.findByText('Пароль сброшен. Временный пароль передан клинике.')).toBeInTheDocument()
  })

  it('у скрытой клиники нет кнопок аккаунта, статус «Заблокирован — клиника скрыта»', async () => {
    renderClinic(5)
    expect(await screen.findByText('Заблокирован — клиника скрыта')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Сбросить пароль' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Создать аккаунт' })).not.toBeInTheDocument()
  })
})

describe('AdminClinicPage: скрытие', () => {
  it('скрытие: свежее число записей в подтверждении, статус, метка и блокировка аккаунта', async () => {
    const { user } = renderClinic(2)
    await screen.findByRole('heading', { level: 1, name: 'ВетДоктор' })
    // Пока админ смотрел страницу, владельцы успели записаться ещё.
    updateServer((state) => {
      const clinic = state.clinics.find((item) => item.id === 2)
      if (clinic) clinic.futureAppointments = 9
    })
    await user.click(screen.getByRole('button', { name: 'Скрыть клинику' }))
    const dialog = screen.getByRole('dialog', { name: 'Скрыть клинику' })
    expect(await within(dialog).findByText('Будет отменено 9 записей. Владельцы получат уведомление.')).toBeInTheDocument()
    expect(within(dialog).getByText('Аккаунт клиники будет заблокирован, её сессии завершатся.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Скрыть' }))
    expect(await screen.findByText('Клиника скрыта. Отменено записей: 9.')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Скрыть' })).not.toBeInTheDocument()
    expect(dialog).not.toHaveAttribute('open')
    expect(screen.getByText('Скрыта')).toBeInTheDocument()
    expect(screen.getByText('Заблокирован — клиника скрыта')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Сбросить пароль' })).not.toBeInTheDocument()
    // Кнопки «Скрыть клинику» больше нет — фокус на заголовке карточки.
    expect(screen.getByRole('heading', { name: 'Скрытие' })).toHaveFocus()
  })

  it('пока идёт скрытие, окно не закрыть; ответ закрывает его и показывает статус', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.post('*/api/admin/clinics/:id/archive', async () => {
        await gate
        const clinic = updateServer((state) => {
          const item = state.clinics.find((entry) => entry.id === 2)
          const account = state.accounts.find((entry) => entry.clinic_id === 2)
          if (!item || !account) throw new Error('В seed нет клиники 2 с аккаунтом')
          item.archived_at = '2026-10-25T10:00:00.000Z'
          item.futureAppointments = 0
          account.is_active = false
          return toAdminClinic(state, item)
        })
        return HttpResponse.json({ clinic, cancelled_appointments: 7 })
      }),
    )
    const { user } = renderClinic(2)
    await user.click(await screen.findByRole('button', { name: 'Скрыть клинику' }))
    const dialog = screen.getByRole('dialog', { name: 'Скрыть клинику' })
    expect(await within(dialog).findByText('Будет отменено 7 записей. Владельцы получат уведомление.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Закрыть' })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Скрыть' }))
    expect(await within(dialog).findByRole('button', { name: 'Скрываем…' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    const cancel = within(dialog).getByRole('button', { name: 'Отмена' })
    expect(cancel).toHaveAttribute('aria-disabled', 'true')
    await user.click(cancel)
    expect(dialog).toHaveAttribute('open')

    release()
    expect(await screen.findByText('Клиника скрыта. Отменено записей: 7.')).toBeInTheDocument()
    expect(dialog).not.toHaveAttribute('open')
  })

  it('ошибка скрытия — в окне, после неё окно снова закрывается', async () => {
    server.use(http.post('*/api/admin/clinics/:id/archive', () => HttpResponse.json({ detail: 'Ошибка' }, { status: 500 })))
    const { user } = renderClinic(2)
    await user.click(await screen.findByRole('button', { name: 'Скрыть клинику' }))
    const dialog = screen.getByRole('dialog', { name: 'Скрыть клинику' })
    expect(await within(dialog).findByText('Будет отменено 7 записей. Владельцы получат уведомление.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Скрыть' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен. Попробуйте через несколько минут.',
    )
    expect(dialog).toHaveAttribute('open')
    expect(within(dialog).getByRole('button', { name: 'Отмена' })).not.toHaveAttribute('aria-disabled', 'true')
    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }))
    expect(dialog).not.toHaveAttribute('open')
    expect(screen.queryByText('Скрыта')).not.toBeInTheDocument()
  })

  it('ответ скрытия не дошёл, а клиника скрыта — страница перечитана; после закрытия окна фокус на заголовке', async () => {
    server.use(
      http.post('*/api/admin/clinics/:id/archive', () => {
        updateServer((state) => {
          const item = state.clinics.find((entry) => entry.id === 2)
          const account = state.accounts.find((entry) => entry.clinic_id === 2)
          if (!item || !account) throw new Error('В seed нет клиники 2 с аккаунтом')
          item.archived_at = '2026-10-25T10:00:00.000Z'
          item.futureAppointments = 0
          account.is_active = false
        })
        return HttpResponse.error()
      }),
    )
    const { user } = renderClinic(2)
    await user.click(await screen.findByRole('button', { name: 'Скрыть клинику' }))
    const dialog = screen.getByRole('dialog', { name: 'Скрыть клинику' })
    expect(await within(dialog).findByText('Будет отменено 7 записей. Владельцы получат уведомление.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Скрыть' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(NETWORK)

    expect(await screen.findByText('Скрыта')).toBeInTheDocument()
    expect(screen.getByText('Заблокирован — клиника скрыта')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }))
    expect(dialog).not.toHaveAttribute('open')
    expect(screen.queryByRole('button', { name: 'Скрыть клинику' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Скрытие' })).toHaveFocus()
  })

  it('не удалось проверить записи — об этом сказано вместо числа, скрыть всё равно можно', async () => {
    const { user } = renderClinic(2)
    await screen.findByRole('heading', { level: 1, name: 'ВетДоктор' })
    // Страница уже загружена: ломается только перезапрос при открытии окна.
    server.use(http.get('*/api/admin/clinics/:id', () => HttpResponse.json({ detail: 'Ошибка' }, { status: 500 })))
    await user.click(screen.getByRole('button', { name: 'Скрыть клинику' }))
    const dialog = screen.getByRole('dialog', { name: 'Скрыть клинику' })
    expect(
      await within(dialog).findByText('Не удалось проверить будущие записи. Число отменённых записей покажем после скрытия.'),
    ).toBeInTheDocument()
    expect(within(dialog).queryByText(/Будет отменено/)).not.toBeInTheDocument()
    expect(within(dialog).getByText('Аккаунт клиники будет заблокирован, её сессии завершатся.')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Скрыть' }))
    expect(await screen.findByText('Клиника скрыта. Отменено записей: 7.')).toBeInTheDocument()
  })

  it('без записей и без аккаунта — «Будущих записей нет.» без строки про аккаунт', async () => {
    const { user } = renderClinic(4)
    await user.click(await screen.findByRole('button', { name: 'Скрыть клинику' }))
    const dialog = screen.getByRole('dialog', { name: 'Скрыть клинику' })
    expect(await within(dialog).findByText('Будущих записей нет.')).toBeInTheDocument()
    expect(within(dialog).queryByText('Аккаунт клиники будет заблокирован, её сессии завершатся.')).not.toBeInTheDocument()
  })

  it('возврат: без подтверждения, статус, аккаунт активен', async () => {
    const { user } = renderClinic(5)
    await user.click(await screen.findByRole('button', { name: 'Вернуть клинику' }))
    expect(await screen.findByText('Клиника возвращена.')).toBeInTheDocument()
    expect(screen.getByText('Активен')).toBeInTheDocument()
    expect(screen.queryByText('Скрыта')).not.toBeInTheDocument()
    // Кнопки «Вернуть клинику» больше нет — фокус на заголовке карточки.
    expect(screen.getByRole('heading', { name: 'Скрытие' })).toHaveFocus()
  })

  it('ответ возврата не дошёл, а клиника возвращена — страница перечитана, старая ошибка не всплывает при новом скрытии', async () => {
    server.use(
      http.post(
        '*/api/admin/clinics/:id/restore',
        () => {
          updateServer((state) => {
            const item = state.clinics.find((entry) => entry.id === 5)
            const account = state.accounts.find((entry) => entry.clinic_id === 5)
            if (!item || !account) throw new Error('В seed нет клиники 5 с аккаунтом')
            item.archived_at = null
            account.is_active = true
          })
          return HttpResponse.error()
        },
        { once: true },
      ),
    )
    const { user } = renderClinic(5)
    await user.click(await screen.findByRole('button', { name: 'Вернуть клинику' }))
    expect(await screen.findByText('Активен')).toBeInTheDocument()
    expect(screen.queryByText('Скрыта')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Скрыть клинику' }))
    const dialog = screen.getByRole('dialog', { name: 'Скрыть клинику' })
    expect(await within(dialog).findByText('Будущих записей нет.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Скрыть' }))
    expect(await screen.findByText('Клиника скрыта. Отменено записей: 0.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Вернуть клинику' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('ошибка возврата — текст над кнопкой', async () => {
    server.use(http.post('*/api/admin/clinics/:id/restore', () => HttpResponse.json({ detail: 'Ошибка' }, { status: 500 })))
    const { user } = renderClinic(5)
    await user.click(await screen.findByRole('button', { name: 'Вернуть клинику' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис временно недоступен. Попробуйте через несколько минут.')
  })
})
