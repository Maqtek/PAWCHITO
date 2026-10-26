import { useQuery } from '@tanstack/react-query'
import { fireEvent, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clinicVetsQuery } from '../../api/queries'
import type { Vet } from '../../api/schema'
import { server } from '../../mocks/node'
import { readServer, updateServer } from '../../mocks/server-state'
import { loginMockAs } from '../../mocks/session'
import { renderWithProviders } from '../../test/render'
import { VetFormModal } from './VetFormModal'

beforeEach(() => {
  loginMockAs('clinic')
})

const NETWORK = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'

const seedVet = (id: number) => {
  const vet = readServer().vets.find((item) => item.id === id)
  if (!vet) throw new Error(`В seed нет врача ${id}`)
  return vet
}

/** Список врачей из кэша, как у страницы: видно, перечитан ли он. */
function ListProbe() {
  const { data } = useQuery(clinicVetsQuery)
  return <span data-testid="list">{data?.map((vet) => vet.full_name).join('|')}</span>
}

function renderForm(vet?: Vet) {
  const onSaved = vi.fn()
  const onClose = vi.fn()
  const result = renderWithProviders(
    <>
      <ListProbe />
      <VetFormModal open vet={vet} onClose={onClose} onSaved={onSaved} />
    </>,
  )
  return { ...result, onSaved, onClose, dialog: screen.getByRole('dialog') }
}

/** Тела PATCH-запросов; обработчик ничего не отвечает — запрос уходит дальше, в мок врачей. */
function capturePatches() {
  const bodies: unknown[] = []
  server.use(
    http.patch('*/api/clinic/vets/:id', async ({ request }) => {
      bodies.push(await request.clone().json())
    }),
  )
  return bodies
}

describe('VetFormModal: добавление', () => {
  it('пустое ФИО — ошибка, фокус на поле, запроса нет', async () => {
    let calls = 0
    server.use(
      http.post('*/api/clinic/vets', () => {
        calls += 1
      }),
    )
    const { user, dialog } = renderForm()
    expect(within(dialog).getByRole('heading', { name: 'Новый врач' })).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('ФИО'), '   ')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить врача' }))
    expect(within(dialog).getByLabelText('ФИО')).toHaveFocus()
    expect(within(dialog).getByLabelText('ФИО')).toHaveAccessibleDescription('Заполните поле')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls).toBe(0)
  })

  it('специализация необязательна: пробелы обрезаны, пустая уходит как null', async () => {
    const { user, dialog, onSaved } = renderForm()
    expect(within(dialog).getByLabelText('Специализация')).toHaveAccessibleDescription('Необязательно, например «терапевт»')
    await user.type(within(dialog).getByLabelText('ФИО'), '  Иванова Анна Сергеевна ')
    await user.type(within(dialog).getByLabelText('Специализация'), '   ')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить врача' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onSaved.mock.calls[0][0]).toMatchObject({ full_name: 'Иванова Анна Сергеевна', specialization: null, on_vacation: false })
    expect(readServer().vets.at(-1)).toMatchObject({ clinic_id: 2, full_name: 'Иванова Анна Сергеевна' })
  })

  it('ответ 422 — ошибка у поля и над кнопкой', async () => {
    server.use(
      http.post('*/api/clinic/vets', () =>
        HttpResponse.json(
          { detail: [{ loc: ['body', 'full_name'], msg: 'ФИО содержит недопустимые символы', type: 'value_error' }] },
          { status: 422 },
        ),
      ),
    )
    const { user, dialog, onSaved } = renderForm()
    await user.type(within(dialog).getByLabelText('ФИО'), 'Петров')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить врача' }))
    expect(await within(dialog).findByText('ФИО содержит недопустимые символы')).toBeInTheDocument()
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Проверьте поля формы.')
    expect(within(dialog).getByLabelText('ФИО')).toHaveFocus()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('ответ не дошёл, а врач добавлен — ошибка в окне, список перечитан', async () => {
    server.use(
      http.post('*/api/clinic/vets', () => {
        updateServer((state) => {
          state.vets.push({ ...state.vets[0], id: state.nextVetId, full_name: 'Иванова Анна' })
          state.nextVetId += 1
        })
        return HttpResponse.error()
      }),
    )
    const { user, dialog } = renderForm()
    await vi.waitFor(() => expect(screen.getByTestId('list')).toHaveTextContent('Петров Павел Петрович'))
    await user.type(within(dialog).getByLabelText('ФИО'), 'Иванова Анна')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить врача' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(NETWORK)
    await vi.waitFor(() => expect(screen.getByTestId('list')).toHaveTextContent('Иванова Анна'))
  })

  it('пока идёт запрос, окно не закрыть', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.post('*/api/clinic/vets', async () => {
        await gate
      }),
    )
    const { user, dialog, onClose, onSaved } = renderForm()
    await user.type(within(dialog).getByLabelText('ФИО'), 'Иванова Анна')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить врача' }))
    expect(await within(dialog).findByRole('button', { name: 'Сохраняем…' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    const cancel = within(dialog).getByRole('button', { name: 'Отмена' })
    expect(cancel).toHaveAttribute('aria-disabled', 'true')
    await user.click(cancel)
    expect(onClose).not.toHaveBeenCalled()

    release()
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
  })
})

describe('VetFormModal: изменение', () => {
  it('поля заполнены; уходят только изменённые поля', async () => {
    const bodies = capturePatches()
    const { user, dialog, onSaved } = renderForm(seedVet(4))
    expect(within(dialog).getByRole('heading', { name: 'Изменить данные врача' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('ФИО')).toHaveValue('Петров Павел Петрович')
    expect(within(dialog).getByLabelText('Специализация')).toHaveValue('терапевт')
    await user.clear(within(dialog).getByLabelText('Специализация'))
    await user.type(within(dialog).getByLabelText('Специализация'), 'хирург')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(bodies).toEqual([{ specialization: 'хирург' }])
    expect(onSaved.mock.calls[0][0]).toMatchObject({ full_name: 'Петров Павел Петрович', specialization: 'хирург' })
  })

  it('стёртая специализация уходит как null и убирается', async () => {
    const bodies = capturePatches()
    const { user, dialog, onSaved } = renderForm(seedVet(4))
    await user.clear(within(dialog).getByLabelText('Специализация'))
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(bodies).toEqual([{ specialization: null }])
    expect(readServer().vets.find((vet) => vet.id === 4)?.specialization).toBeNull()
  })

  it('ничего не изменено (пробелы по краям не в счёт) — окно закрывается без запроса', async () => {
    const bodies = capturePatches()
    const { user, dialog, onClose, onSaved } = renderForm(seedVet(4))
    await user.type(within(dialog).getByLabelText('ФИО'), '  ')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSaved).not.toHaveBeenCalled()
    expect(bodies).toEqual([])
  })

  it('врач не найден (404) — текст ошибки и перечитанный список', async () => {
    server.use(http.patch('*/api/clinic/vets/:id', () => HttpResponse.json({ detail: 'Врач не найден' }, { status: 404 })))
    const { user, dialog } = renderForm(seedVet(4))
    await user.type(within(dialog).getByLabelText('ФИО'), ' мл.')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Врач не найден. Список врачей обновлён.')
  })
})
