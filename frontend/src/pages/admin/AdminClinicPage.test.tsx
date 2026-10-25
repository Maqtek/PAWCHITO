import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppRoutes } from '../../app/routes'
import { server } from '../../mocks/node'
import { readServer } from '../../mocks/server-state'
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
    expect(region).toHaveTextContent('Клиника добавлена. Создайте аккаунт, чтобы клиника могла войти.')
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
