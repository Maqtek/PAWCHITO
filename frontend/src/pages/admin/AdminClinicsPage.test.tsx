import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../mocks/node'
import { loginMockAs } from '../../mocks/session'
import { updateServer } from '../../mocks/server-state'
import { renderRoute } from '../../test/render'

beforeEach(() => {
  loginMockAs('admin')
})

const renderList = () => renderRoute('/admin/clinics')

// Добавление клиники из списка — переход на её страницу со статусом — проверяет AdminClinicPage.test.tsx.
describe('AdminClinicsPage', () => {
  it('вкладки со счётчиками: по умолчанию активные, скрытые — отдельно', async () => {
    const { user } = renderList()
    expect(await screen.findByRole('tab', { name: 'Активные (3)' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('link', { name: /ВетДоктор/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Зоовет/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Айболит/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Скрытые (1)' }))
    const hidden = screen.getByRole('link', { name: /Айболит/ })
    expect(within(hidden).getByText('Заблокирован')).toBeInTheDocument()
  })

  it('метки аккаунта и расписание', async () => {
    renderList()
    const vetDoctor = await screen.findByRole('link', { name: /ВетДоктор/ })
    expect(within(vetDoctor).getByText('clinic@example.com')).toBeInTheDocument()
    expect(within(vetDoctor).getByText('Пн–Сб, 09:00–20:00')).toBeInTheDocument()
    expect(within(screen.getByRole('link', { name: /Зоовет/ })).getByText('Нет аккаунта')).toBeInTheDocument()
  })

  it('поиск по названию и адресу без учёта регистра; ничего не найдено', async () => {
    const { user } = renderList()
    const search = await screen.findByLabelText('Поиск по названию или адресу')
    await user.type(search, 'САДОВАЯ')
    expect(screen.getByRole('link', { name: /Зоовет/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /ВетДоктор/ })).not.toBeInTheDocument()
    await user.clear(search)
    await user.type(search, 'нет такой')
    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument()
  })

  it('поиск обрезает пробелы и находит по названию', async () => {
    const { user } = renderList()
    await user.type(await screen.findByLabelText('Поиск по названию или адресу'), '  зоовет ')
    expect(screen.getByRole('link', { name: /Зоовет/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /ВетДоктор/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Новая/ })).not.toBeInTheDocument()
  })

  it('пустой список', async () => {
    server.use(http.get('*/api/admin/clinics', () => HttpResponse.json([])))
    renderList()
    expect(await screen.findByText('Клиник пока нет')).toBeInTheDocument()
  })

  it('нет скрытых клиник — пустая вкладка «Скрытые»', async () => {
    updateServer((state) => {
      for (const clinic of state.clinics) clinic.archived_at = null
    })
    const { user } = renderList()
    expect(await screen.findByRole('tab', { name: 'Активные (4)' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Скрытые (0)' }))
    expect(screen.getByText('Скрытых клиник нет')).toBeInTheDocument()
  })

  it('ошибка загрузки — сообщение; «Повторить» показывает список', async () => {
    server.use(http.get('*/api/admin/clinics', () => HttpResponse.json({ detail: 'Ошибка' }, { status: 500 }), { once: true }))
    const { user } = renderList()
    expect(await screen.findByText('Не удалось загрузить клиники')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('link', { name: /ВетДоктор/ })).toBeInTheDocument()
    expect(screen.queryByText('Не удалось загрузить клиники')).not.toBeInTheDocument()
  })
})
