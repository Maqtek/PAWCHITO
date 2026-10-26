import { useQuery } from '@tanstack/react-query'
import { fireEvent, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { petsQuery } from '../../api/queries'
import type { Pet } from '../../api/schema'
import { server } from '../../mocks/node'
import { readServer, updateServer } from '../../mocks/server-state'
import { renderWithProviders } from '../../test/render'
import { PetFormModal } from './PetFormModal'

const NETWORK = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'

const seedPet = (id: number) => {
  const pet = readServer().pets.find((item) => item.id === id)
  if (!pet) throw new Error(`В seed нет питомца ${id}`)
  return pet
}

/** Список питомцев из кэша, как у страницы и переключателя: видно, перечитан ли он. */
function ListProbe() {
  const { data } = useQuery(petsQuery)
  return <span data-testid="list">{data?.map((pet) => pet.name).join('|')}</span>
}

function renderForm(pet?: Pet) {
  const onSaved = vi.fn()
  const onClose = vi.fn()
  const result = renderWithProviders(
    <>
      <ListProbe />
      <PetFormModal open pet={pet} onClose={onClose} onSaved={onSaved} />
    </>,
  )
  return { ...result, onSaved, onClose, dialog: screen.getByRole('dialog') }
}

/** Тела запросов; обработчик ничего не отвечает — запрос уходит дальше, в мок питомцев. */
function captureBodies(method: 'post' | 'patch') {
  const bodies: unknown[] = []
  const path = method === 'post' ? '*/api/pets' : '*/api/pets/:petId'
  server.use(
    http[method](path, async ({ request }) => {
      bodies.push(await request.clone().json())
    }),
  )
  return bodies
}

/** Поле даты: user.type в jsdom не набирает type="date" по символам — значение ставится целиком, как из календаря. */
function setBirthDate(dialog: HTMLElement, value: string) {
  fireEvent.change(within(dialog).getByLabelText('Дата рождения'), { target: { value } })
}

describe('PetFormModal: добавление', () => {
  it('пустые кличка и вид — ошибки, фокус на кличке, запроса нет', async () => {
    const bodies = captureBodies('post')
    const { user, dialog } = renderForm()
    expect(within(dialog).getByRole('heading', { name: 'Новый питомец' })).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Кличка'), '   ')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить питомца' }))
    expect(within(dialog).getByLabelText('Кличка')).toHaveFocus()
    expect(within(dialog).getByLabelText('Кличка')).toHaveAccessibleDescription('Заполните поле')
    expect(within(dialog).getByLabelText('Вид')).toHaveAccessibleDescription('Выберите вид')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(bodies).toEqual([])
  })

  it('все поля: пробелы обрезаны, пустая порода — null, пол по умолчанию «Не указан»', async () => {
    const bodies = captureBodies('post')
    const { user, dialog, onSaved } = renderForm()
    expect(within(dialog).getByLabelText('Пол')).toHaveValue('unknown')
    await user.type(within(dialog).getByLabelText('Кличка'), '  Бублик ')
    await user.selectOptions(within(dialog).getByLabelText('Вид'), 'Собака')
    await user.type(within(dialog).getByLabelText('Порода'), '   ')
    setBirthDate(dialog, '2024-02-29')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить питомца' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(bodies).toEqual([{ name: 'Бублик', species: 'dog', breed: null, birth_date: '2024-02-29', sex: 'unknown' }])
    expect(onSaved.mock.calls[0][0]).toMatchObject({ owner_id: 1, name: 'Бублик', species: 'dog', birth_date: '2024-02-29' })
    await vi.waitFor(() => expect(screen.getByTestId('list')).toHaveTextContent('Майло|Барсик|Бублик'))
  })

  it('дата рождения в будущем или раньше 1900 года — ошибка у поля без запроса', async () => {
    const bodies = captureBodies('post')
    const { user, dialog } = renderForm()
    expect(within(dialog).getByLabelText('Дата рождения')).toHaveAttribute('min', '1900-01-01')
    await user.type(within(dialog).getByLabelText('Кличка'), 'Бублик')
    await user.selectOptions(within(dialog).getByLabelText('Вид'), 'Кошка')
    setBirthDate(dialog, '2999-01-01')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить питомца' }))
    expect(within(dialog).getByLabelText('Дата рождения')).toHaveFocus()
    expect(within(dialog).getByText('Дата рождения — не позже сегодняшнего дня')).toBeInTheDocument()
    setBirthDate(dialog, '1899-12-31')
    expect(within(dialog).getByText('Дата рождения — не раньше 1900 года')).toBeInTheDocument()
    expect(bodies).toEqual([])
  })

  it('ответ 422 — ошибка у поля и над кнопкой', async () => {
    server.use(
      http.post('*/api/pets', () =>
        HttpResponse.json(
          { detail: [{ loc: ['body', 'name'], msg: 'Кличка содержит недопустимые символы', type: 'value_error' }] },
          { status: 422 },
        ),
      ),
    )
    const { user, dialog, onSaved } = renderForm()
    await user.type(within(dialog).getByLabelText('Кличка'), 'Бублик')
    await user.selectOptions(within(dialog).getByLabelText('Вид'), 'Другое')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить питомца' }))
    expect(await within(dialog).findByText('Кличка содержит недопустимые символы')).toBeInTheDocument()
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Проверьте поля формы.')
    expect(within(dialog).getByLabelText('Кличка')).toHaveFocus()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('ответ не дошёл, а питомец добавлен — ошибка в окне, список перечитан', async () => {
    server.use(
      http.post('*/api/pets', () => {
        updateServer((state) => {
          state.pets.push({ ...state.pets[1], id: state.nextPetId, name: 'Бублик' })
          state.nextPetId += 1
        })
        return HttpResponse.error()
      }),
    )
    const { user, dialog } = renderForm()
    await vi.waitFor(() => expect(screen.getByTestId('list')).toHaveTextContent('Майло|Барсик'))
    await user.type(within(dialog).getByLabelText('Кличка'), 'Бублик')
    await user.selectOptions(within(dialog).getByLabelText('Вид'), 'Кошка')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить питомца' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(NETWORK)
    await vi.waitFor(() => expect(screen.getByTestId('list')).toHaveTextContent('Бублик'))
  })

  it('пока идёт запрос, окно не закрыть', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.post('*/api/pets', async () => {
        await gate
      }),
    )
    const { user, dialog, onClose, onSaved } = renderForm()
    await user.type(within(dialog).getByLabelText('Кличка'), 'Бублик')
    await user.selectOptions(within(dialog).getByLabelText('Вид'), 'Собака')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить питомца' }))
    expect(await within(dialog).findByRole('button', { name: 'Сохраняем…' })).toBeInTheDocument()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    const cancel = within(dialog).getByRole('button', { name: 'Отмена' })
    expect(cancel).toHaveAttribute('aria-disabled', 'true')
    await user.click(cancel)
    expect(onClose).not.toHaveBeenCalled()

    release()
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
  })
})

describe('PetFormModal: изменение', () => {
  it('поля заполнены; уходят только изменённые поля', async () => {
    const bodies = captureBodies('patch')
    const { user, dialog, onSaved } = renderForm(seedPet(11))
    expect(within(dialog).getByRole('heading', { name: 'Изменить данные питомца' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Кличка')).toHaveValue('Барсик')
    expect(within(dialog).getByLabelText('Вид')).toHaveValue('cat')
    expect(within(dialog).getByLabelText('Порода')).toHaveValue('Британская короткошёрстная')
    expect(within(dialog).getByLabelText('Дата рождения')).toHaveValue('2025-03-14')
    expect(within(dialog).getByLabelText('Пол')).toHaveValue('male')
    await user.selectOptions(within(dialog).getByLabelText('Пол'), 'Девочка')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(bodies).toEqual([{ sex: 'female' }])
    expect(onSaved.mock.calls[0][0]).toMatchObject({ name: 'Барсик', sex: 'female' })
  })

  it('стёртые порода и дата рождения уходят как null и убираются', async () => {
    const bodies = captureBodies('patch')
    const { user, dialog, onSaved } = renderForm(seedPet(11))
    await user.clear(within(dialog).getByLabelText('Порода'))
    setBirthDate(dialog, '')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(bodies).toEqual([{ breed: null, birth_date: null }])
    expect(readServer().pets.find((pet) => pet.id === 11)).toMatchObject({ breed: null, birth_date: null })
  })

  it('ничего не изменено (пробелы по краям не в счёт) — окно закрывается без запроса', async () => {
    const bodies = captureBodies('patch')
    const { user, dialog, onClose, onSaved } = renderForm(seedPet(11))
    await user.type(within(dialog).getByLabelText('Кличка'), '  ')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSaved).not.toHaveBeenCalled()
    expect(bodies).toEqual([])
  })

  it('питомец не найден (404) — текст ошибки', async () => {
    server.use(http.patch('*/api/pets/:petId', () => HttpResponse.json({ detail: 'Питомец не найден' }, { status: 404 })))
    const { user, dialog } = renderForm(seedPet(11))
    await user.type(within(dialog).getByLabelText('Кличка'), '!')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Питомец не найден. Список питомцев обновлён.')
  })
})
