import { useQuery } from '@tanstack/react-query'
import { act, screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminClinicQuery, queryKeys } from '../../api/queries'
import type { AdminClinic } from '../../api/schema'
import { server } from '../../mocks/node'
import { readServer, toAdminClinic } from '../../mocks/server-state'
import { loginMockAs } from '../../mocks/session'
import { renderWithProviders } from '../../test/render'
import { ClinicFormModal } from './ClinicFormModal'

beforeEach(() => {
  loginMockAs('admin')
})

function renderForm(clinic?: AdminClinic) {
  const onSaved = vi.fn()
  const onClose = vi.fn()
  const result = renderWithProviders(<ClinicFormModal open clinic={clinic} onClose={onClose} onSaved={onSaved} />)
  return { ...result, onSaved, onClose, dialog: screen.getByRole('dialog') }
}

async function fillRequired(user: UserEvent) {
  await user.type(screen.getByLabelText('Название'), 'Лапа')
  await user.type(screen.getByLabelText('Адрес'), 'ул. Мира, 1')
  await user.type(screen.getByLabelText('Телефон'), '8 (999) 777-88-99')
}

const vetDoctor = () => toAdminClinic(readServer(), readServer().clinics[0])

/** Клиника приходит из кэша запроса, как на странице: обновление кэша меняет проп открытого окна. */
function LiveClinicModal({ id, onSaved, onClose }: { id: number; onSaved: () => void; onClose: () => void }) {
  const { data } = useQuery(adminClinicQuery(id))
  return data ? <ClinicFormModal open clinic={data} onClose={onClose} onSaved={onSaved} /> : null
}

describe('ClinicFormModal: добавление', () => {
  it('пустые поля — ошибки, фокус на названии, запроса нет', async () => {
    let calls = 0
    server.use(
      http.post('*/api/admin/clinics', () => {
        calls += 1
      }),
    )
    const { user, dialog } = renderForm()
    expect(within(dialog).getByRole('heading', { name: 'Новая клиника' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Добавить клинику' }))
    expect(within(dialog).getAllByText('Заполните поле')).toHaveLength(3)
    expect(screen.getByLabelText('Название')).toHaveFocus()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls).toBe(0)
  })

  it('закрытие не позже открытия и ни одного дня — ошибки у полей', async () => {
    const { user, dialog } = renderForm()
    await fillRequired(user)
    await user.selectOptions(screen.getByLabelText('Открытие'), '20:00')
    await user.selectOptions(screen.getByLabelText('Закрытие'), '09:00')
    for (const day of ['Пн', 'Вт', 'Ср', 'Чт', 'Пт']) await user.click(screen.getByRole('checkbox', { name: day }))
    await user.click(within(dialog).getByRole('button', { name: 'Добавить клинику' }))
    expect(within(dialog).getByText('Закрытие — позже открытия')).toBeInTheDocument()
    expect(within(dialog).getByText('Выберите хотя бы один рабочий день')).toBeInTheDocument()
  })

  it('нет рабочих дней — фокус на группе дней, ошибка привязана к ней', async () => {
    const { user, dialog } = renderForm()
    await fillRequired(user)
    for (const day of ['Пн', 'Вт', 'Ср', 'Чт', 'Пт']) await user.click(screen.getByRole('checkbox', { name: day }))
    await user.click(within(dialog).getByRole('button', { name: 'Добавить клинику' }))
    const group = within(dialog).getByRole('group', { name: 'Рабочие дни' })
    const error = within(dialog).getByText('Выберите хотя бы один рабочий день')
    expect(group).toHaveFocus()
    expect(group).toHaveAttribute('aria-describedby', error.id)
    expect(group).toHaveAccessibleDescription('Выберите хотя бы один рабочий день')
  })

  it('закрытие не позже открытия — ошибка привязана к полю «Закрытие», фокус на нём', async () => {
    const { user, dialog } = renderForm()
    await fillRequired(user)
    await user.selectOptions(screen.getByLabelText('Открытие'), '20:00')
    await user.selectOptions(screen.getByLabelText('Закрытие'), '09:00')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить клинику' }))
    const closes = screen.getByLabelText('Закрытие')
    expect(closes).toHaveFocus()
    expect(closes).toHaveAccessibleDescription('Закрытие — позже открытия')
  })

  it('добавление: телефон нормализован, дни по порядку, клиника на сервере', async () => {
    const { user, dialog, onSaved } = renderForm()
    await fillRequired(user)
    await user.click(screen.getByRole('checkbox', { name: 'Сб' }))
    await user.click(within(dialog).getByRole('button', { name: 'Добавить клинику' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onSaved.mock.calls[0][0]).toMatchObject({
      name: 'Лапа',
      phone: '+79997778899',
      opens_at: '09:00',
      closes_at: '20:00',
      work_days: [1, 2, 3, 4, 5, 6],
    })
    expect(readServer().clinics.some((clinic) => clinic.name === 'Лапа')).toBe(true)
  })

  it('422 от сервера — ошибка у поля', async () => {
    server.use(
      http.post('*/api/admin/clinics', () =>
        HttpResponse.json(
          { detail: [{ loc: ['body', 'name'], msg: 'Название — не длиннее 100 символов', type: 'value_error' }] },
          { status: 422 },
        ),
      ),
    )
    const { user, dialog } = renderForm()
    await fillRequired(user)
    await user.click(within(dialog).getByRole('button', { name: 'Добавить клинику' }))
    expect(await within(dialog).findByText('Название — не длиннее 100 символов')).toBeInTheDocument()
  })
})

describe('ClinicFormModal: изменение', () => {
  it('поля заполнены, подсказка про записи; уходят только изменённые поля', async () => {
    const bodies: unknown[] = []
    server.use(
      http.patch('*/api/admin/clinics/:id', async ({ request }) => {
        bodies.push(await request.clone().json())
      }),
    )
    const { user, dialog, onSaved } = renderForm(vetDoctor())
    expect(within(dialog).getByRole('heading', { name: 'Изменить клинику' })).toBeInTheDocument()
    expect(screen.getByLabelText('Название')).toHaveValue('ВетДоктор')
    expect(within(dialog).getByText('Существующие записи не меняются, новые слоты считаются по новым часам.')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Телефон'))
    await user.type(screen.getByLabelText('Телефон'), '+7 999 123-45-67')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(bodies).toEqual([{ phone: '+79991234567' }])
  })

  it('без изменений — закрывается без запроса', async () => {
    let calls = 0
    server.use(
      http.patch('*/api/admin/clinics/:id', () => {
        calls += 1
      }),
    )
    const { user, dialog, onClose } = renderForm(vetDoctor())
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(calls).toBe(0)
  })
})

describe('ClinicFormModal: клиника обновилась при открытом окне', () => {
  // Кэш получил свежие данные (например, другой администратор поменял адрес), пока окно открыто.
  async function openThenRefetch(onSaved = vi.fn(), onClose = vi.fn()) {
    const clinic = vetDoctor()
    const result = renderWithProviders(<LiveClinicModal id={clinic.id} onSaved={onSaved} onClose={onClose} />)
    await screen.findByLabelText('Название')
    act(() => {
      result.queryClient.setQueryData(queryKeys.adminClinic(clinic.id), { ...clinic, address: 'ул. Новая, 1' })
    })
    return { ...result, onSaved, onClose, dialog: screen.getByRole('dialog') }
  }

  it('правится только телефон — чужое изменение адреса не откатывается', async () => {
    const bodies: unknown[] = []
    server.use(
      http.patch('*/api/admin/clinics/:id', async ({ request }) => {
        bodies.push(await request.clone().json())
      }),
    )
    const { user, dialog, onSaved } = await openThenRefetch()
    expect(screen.getByLabelText('Адрес')).toHaveValue('ул. Ленина, 10')
    await user.clear(screen.getByLabelText('Телефон'))
    await user.type(screen.getByLabelText('Телефон'), '+7 999 123-45-67')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(bodies).toEqual([{ phone: '+79991234567' }])
  })

  it('без правок — закрывается без запроса, устаревший PATCH не уходит', async () => {
    let calls = 0
    server.use(
      http.patch('*/api/admin/clinics/:id', () => {
        calls += 1
      }),
    )
    const { user, dialog, onClose } = await openThenRefetch()
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(calls).toBe(0)
  })
})
