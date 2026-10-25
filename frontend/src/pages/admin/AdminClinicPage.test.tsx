import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppRoutes } from '../../app/routes'
import { server } from '../../mocks/node'
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
