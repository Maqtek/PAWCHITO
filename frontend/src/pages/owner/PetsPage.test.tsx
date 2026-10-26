import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { AppRoutes } from '../../app/routes'
import { NBSP } from '../../lib/format'
import { server } from '../../mocks/node'
import { readServer, updateServer } from '../../mocks/server-state'
import { renderWithProviders } from '../../test/render'

const renderPets = () => renderWithProviders(<AppRoutes />, { route: '/pets' })

/** role="status" есть и у спиннеров, поэтому статус страницы ищем по тексту и проверяем, что он в live-регионе. */
async function findStatus(text: string) {
  const message = await screen.findByText(text)
  expect(message.closest('[role="status"]')).not.toBeNull()
  return message
}

const card = (name: string) => screen.getByRole('article', { name })
const names = () => screen.queryAllByRole('article').map((item) => within(item).getByRole('heading').textContent)
const switcher = () => screen.getByRole('button', { name: /^Питомец: / })

describe('PetsPage: список', () => {
  it('только свои активные питомцы в порядке добавления; иллюстрация по виду, данные, выбранный', async () => {
    renderPets()
    expect(await screen.findByRole('article', { name: 'Майло' })).toBeInTheDocument()
    expect(names()).toEqual(['Майло', 'Барсик'])
    // Архивный Кеша и чужой Рекс в список не попадают.
    expect(screen.queryByText('Кеша')).not.toBeInTheDocument()
    expect(screen.queryByText('Рекс')).not.toBeInTheDocument()

    const milo = card('Майло')
    expect(within(milo).getByRole('img', { name: 'Собака Майло' })).toBeInTheDocument()
    expect(within(milo).getByText(/^Собака · Золотистый ретривер · \d+\s(год|года|лет) · Мальчик$/)).toBeInTheDocument()
    expect(within(milo).getByText('Выбран')).toBeInTheDocument()
    expect(within(milo).queryByRole('button', { name: /^Выбрать/ })).not.toBeInTheDocument()
    expect(within(card('Барсик')).getByRole('img', { name: 'Кошка Барсик' })).toBeInTheDocument()
    expect(within(card('Барсик')).getByRole('button', { name: 'Выбрать, Барсик' })).toBeInTheDocument()
  })

  it('«Выбрать» меняет питомца и в переключателе', async () => {
    const { user } = renderPets()
    await user.click(await screen.findByRole('button', { name: 'Выбрать, Барсик' }))
    await findStatus('Выбран питомец Барсик.')
    expect(within(card('Барсик')).getByText('Выбран')).toBeInTheDocument()
    expect(within(card('Майло')).getByRole('button', { name: 'Выбрать, Майло' })).toBeInTheDocument()
    expect(switcher()).toHaveAccessibleName('Питомец: Барсик. Сменить питомца')
  })

  it('питомцев нет — приглашение добавить, без второй кнопки в шапке', async () => {
    updateServer((state) => {
      state.pets = state.pets.filter((pet) => pet.owner_id !== 1)
    })
    renderPets()
    expect(await screen.findByText('Питомцев пока нет')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Добавить питомца' })).toHaveLength(1)
  })

  it('ошибка загрузки и «Повторить»', async () => {
    let fail = true
    server.use(
      http.get('*/api/pets', () => (fail ? HttpResponse.json({ detail: 'Ошибка' }, { status: 500 }) : undefined)),
    )
    const { user } = renderPets()
    expect(await screen.findByText('Не удалось загрузить питомцев')).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('article', { name: 'Майло' })).toBeInTheDocument()
  })
})

describe('PetsPage: добавление и изменение', () => {
  it('новый питомец появляется в конце списка и сразу выбран', async () => {
    const { user } = renderPets()
    await screen.findByRole('article', { name: 'Майло' })
    await user.click(screen.getByRole('button', { name: 'Добавить питомца' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Кличка'), 'Кузя')
    await user.selectOptions(within(dialog).getByLabelText('Вид'), 'Другое')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить питомца' }))
    await findStatus('Питомец Кузя добавлен и выбран.')
    expect(names()).toEqual(['Майло', 'Барсик', 'Кузя'])
    expect(within(card('Кузя')).getByRole('img', { name: 'Другое Кузя' })).toBeInTheDocument()
    expect(within(card('Кузя')).getByText('Выбран')).toBeInTheDocument()
    expect(switcher()).toHaveAccessibleName('Питомец: Кузя. Сменить питомца')
  })

  it('изменение: карточка обновлена, статус', async () => {
    const { user } = renderPets()
    await user.click(await screen.findByRole('button', { name: 'Изменить, Барсик' }))
    const dialog = screen.getByRole('dialog')
    await user.clear(within(dialog).getByLabelText('Порода'))
    await user.type(within(dialog).getByLabelText('Порода'), 'Сибирская')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await findStatus('Данные питомца сохранены.')
    expect(within(card('Барсик')).getByText(/^Кошка · Сибирская · /)).toBeInTheDocument()
  })
})

describe('PetsPage: архив', () => {
  it('«Отмена» в подтверждении ничего не меняет', async () => {
    const { user } = renderPets()
    await user.click(await screen.findByRole('button', { name: 'В архив, Барсик' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Вернуть питомца из архива пока нельзя/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    expect(names()).toEqual(['Майло', 'Барсик'])
    expect(readServer().pets.find((pet) => pet.id === 11)?.archived_at).toBeNull()
  })

  it('выбранный питомец уходит в архив: пропадает из списка, переключатель берёт первого, фокус на списке', async () => {
    const { user } = renderPets()
    await user.click(await screen.findByRole('button', { name: 'В архив, Майло' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'В архив' }))
    // Две предстоящие записи Майло отменены вместе с архивом.
    await findStatus('Питомец перенесён в архив: отменены 2 записи.')
    expect(names()).toEqual(['Барсик'])
    expect(within(card('Барсик')).getByText('Выбран')).toBeInTheDocument()
    expect(switcher()).toHaveAccessibleName('Питомец: Барсик. Сменить питомца')
    // Фокус — на контейнере списка: кнопка, открывшая окно, пропала вместе с карточкой.
    expect(card('Барсик').closest('ul')?.parentElement).toHaveFocus()
    expect(readServer().pets.find((pet) => pet.id === 10)?.archived_at).not.toBeNull()
  })

  it('статус называет отменённые записи и удалённые дела', async () => {
    server.use(
      http.post('*/api/pets/:petId/archive', () => {
        const pet = { ...readServer().pets[1], archived_at: '2026-10-26T12:00:00+03:00' }
        return HttpResponse.json({ pet, cancelled_appointments: 2, deleted_reminders: 5 })
      }),
    )
    const { user } = renderPets()
    await user.click(await screen.findByRole('button', { name: 'В архив, Барсик' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'В архив' }))
    // getByText сравнивает с текстом, где неразрывные пробелы уже стали обычными, — их проверяем отдельно.
    const message = await findStatus('Питомец перенесён в архив: отменены 2 записи, удалено 5 дел.')
    expect(message.textContent).toBe(`Питомец перенесён в архив: отменены 2${NBSP}записи, удалено 5${NBSP}дел.`)
  })

  it('ошибка архивирования — в окне; питомец на месте', async () => {
    server.use(http.post('*/api/pets/:petId/archive', () => HttpResponse.json({ detail: 'Ошибка' }, { status: 500 })))
    const { user } = renderPets()
    await user.click(await screen.findByRole('button', { name: 'В архив, Барсик' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'В архив' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Сервис временно недоступен')
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    expect(names()).toEqual(['Майло', 'Барсик'])
  })
})
