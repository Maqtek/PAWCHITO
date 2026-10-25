import { useQuery } from '@tanstack/react-query'
import { act, fireEvent, screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminClinicQuery, adminClinicsQuery, queryKeys } from '../../api/queries'
import type { AdminClinic } from '../../api/schema'
import { server } from '../../mocks/node'
import { readServer, toAdminClinic, updateServer } from '../../mocks/server-state'
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

/** Список и страница клиники из кэша, как у страниц админки: видно, перечитаны ли они. */
function CacheProbe({ id }: { id: number }) {
  const { data: list } = useQuery(adminClinicsQuery)
  const { data: clinic } = useQuery(adminClinicQuery(id))
  return (
    <>
      <span data-testid="list">{list?.map((item) => item.name).join('|')}</span>
      <span data-testid="clinic">{clinic?.phone}</span>
    </>
  )
}

/** Ворота: запрос держится, пока тест не вызовет release. */
function createGate() {
  let release!: () => void
  const opened = new Promise<void>((resolve) => {
    release = resolve
  })
  return { opened, release }
}

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

  it('пока идёт добавление, окно не закрыть: Esc и «Отмена» не действуют; ответ — onSaved', async () => {
    const gate = createGate()
    server.use(
      http.post('*/api/admin/clinics', async () => {
        await gate.opened
        const clinic = updateServer((state) => {
          const created = { ...state.clinics[0], id: state.nextClinicId, name: 'Лапа' }
          state.nextClinicId += 1
          state.clinics.push(created)
          return toAdminClinic(state, created)
        })
        return HttpResponse.json(clinic, { status: 201 })
      }),
    )
    const { user, dialog, onSaved, onClose } = renderForm()
    expect(within(dialog).getByRole('button', { name: 'Закрыть' })).toBeInTheDocument()
    await fillRequired(user)
    await user.click(within(dialog).getByRole('button', { name: 'Добавить клинику' }))
    expect(await within(dialog).findByRole('button', { name: 'Сохраняем…' })).toBeInTheDocument()

    expect(within(dialog).queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    const cancel = within(dialog).getByRole('button', { name: 'Отмена' })
    expect(cancel).toHaveAttribute('aria-disabled', 'true')
    await user.click(cancel)
    expect(onClose).not.toHaveBeenCalled()

    gate.release()
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onSaved.mock.calls[0][0]).toMatchObject({ name: 'Лапа' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ответ не дошёл, а клиника создана — список перечитывается: повтор не создаст дубль незаметно', async () => {
    server.use(
      http.post('*/api/admin/clinics', () => {
        updateServer((state) => {
          state.clinics.push({ ...state.clinics[0], id: state.nextClinicId, name: 'Лапа' })
          state.nextClinicId += 1
        })
        return HttpResponse.error()
      }),
    )
    const onSaved = vi.fn()
    const { user } = renderWithProviders(
      <>
        <CacheProbe id={2} />
        <ClinicFormModal open onClose={vi.fn()} onSaved={onSaved} />
      </>,
    )
    await vi.waitFor(() => expect(screen.getByTestId('list')).toHaveTextContent('ВетДоктор'))
    const dialog = screen.getByRole('dialog')
    await fillRequired(user)
    await user.click(within(dialog).getByRole('button', { name: 'Добавить клинику' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    )
    await vi.waitFor(() => expect(screen.getByTestId('list')).toHaveTextContent('|Лапа'))
    expect(onSaved).not.toHaveBeenCalled()
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

  it('ответ не дошёл, а изменение применилось — страница клиники и список перечитываются', async () => {
    server.use(
      http.patch('*/api/admin/clinics/:id', () => {
        updateServer((state) => {
          const clinic = state.clinics.find((item) => item.id === 2)
          if (!clinic) throw new Error('В seed нет клиники 2')
          clinic.phone = '+79991234567'
          clinic.name = 'ВетДоктор Плюс'
        })
        return HttpResponse.error()
      }),
    )
    const { user } = renderWithProviders(
      <>
        <CacheProbe id={2} />
        <ClinicFormModal open clinic={vetDoctor()} onClose={vi.fn()} onSaved={vi.fn()} />
      </>,
    )
    await vi.waitFor(() => expect(screen.getByTestId('clinic')).toHaveTextContent('+79990000000'))
    await vi.waitFor(() => expect(screen.getByTestId('list')).toHaveTextContent('ВетДоктор|'))
    const dialog = screen.getByRole('dialog')
    await user.clear(screen.getByLabelText('Телефон'))
    await user.type(screen.getByLabelText('Телефон'), '+7 999 123-45-67')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    )
    await vi.waitFor(() => expect(screen.getByTestId('clinic')).toHaveTextContent('+79991234567'))
    await vi.waitFor(() => expect(screen.getByTestId('list')).toHaveTextContent('ВетДоктор Плюс'))
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
