import { fireEvent, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { AppRoutes } from '../../app/routes'
import { server } from '../../mocks/node'
import { readServer, updateServer } from '../../mocks/server-state'
import { renderWithProviders } from '../../test/render'

const renderHistory = () => renderWithProviders(<AppRoutes />, { route: '/history' })

/** role="status" есть и у спиннеров, поэтому статус страницы ищем по тексту и проверяем, что он в live-регионе. */
async function findStatus(text: string) {
  const message = await screen.findByText(text)
  expect(message.closest('[role="status"]')).not.toBeNull()
  return message
}

const section = (name: string) => screen.getByRole('region', { name })
const titles = (name: string) =>
  within(section(name))
    .queryAllByRole('article')
    .map((item) => within(item).getByRole('heading').textContent)

describe('HistoryPage', () => {
  it('три раздела выбранного питомца; записи клиники — только для чтения; лента — этап 11', async () => {
    renderHistory()
    expect(await screen.findByRole('article', { name: 'Аллергия на курицу' })).toBeInTheDocument()
    expect(screen.getByText('Особенности здоровья, дневник и прививки: Майло.')).toBeInTheDocument()
    expect(titles('Особенности здоровья')).toEqual(['Аллергия на курицу', 'Дисплазия тазобедренных суставов'])

    const dysplasia = screen.getByRole('article', { name: 'Дисплазия тазобедренных суставов' })
    expect(within(dysplasia).getByText('Внесено клиникой')).toBeInTheDocument()
    expect(within(dysplasia).queryByRole('button')).not.toBeInTheDocument()

    expect(await within(section('Дневник')).findByRole('article', { name: '24 октября 2026' })).toBeInTheDocument()
    expect(titles('Дневник')).toEqual(['24 октября 2026', '20 октября 2026', '10 октября 2026'])
    const fromClinic = within(section('Дневник')).getByRole('article', { name: '10 октября 2026' })
    expect(within(fromClinic).getByText('31,5 кг')).toBeInTheDocument()
    expect(within(fromClinic).queryByRole('button')).not.toBeInTheDocument()

    expect(await within(section('Прививки')).findByRole('article', { name: 'Нобивак DHPPi' })).toBeInTheDocument()
    expect(titles('Прививки')).toEqual(['Нобивак DHPPi', 'Нобивак Rabies'])
    expect(screen.getByText('Появится на этапе 11 роадмапа.')).toBeInTheDocument()
  })

  it('смена питомца в переключателе — записи другого питомца; просроченная прививка отмечена', async () => {
    const { user } = renderHistory()
    await screen.findByRole('article', { name: 'Аллергия на курицу' })
    await user.click(screen.getByRole('button', { name: /^Питомец: Майло/ }))
    await user.click(screen.getByRole('button', { name: /Барсик/ }))
    expect(await screen.findByText('Особенностей пока нет')).toBeInTheDocument()
    expect(await within(section('Дневник')).findByRole('article', { name: '22 октября 2026' })).toBeInTheDocument()
    const trio = await within(section('Прививки')).findByRole('article', { name: 'Нобивак Tricat Trio' })
    expect(within(trio).getByText('Просрочена')).toBeInTheDocument()
  })

  it('питомцев нет — приглашение добавить питомца', async () => {
    updateServer((state) => {
      state.pets = state.pets.filter((pet) => pet.owner_id !== 1)
    })
    renderHistory()
    expect(await screen.findByText('Сначала добавьте питомца')).toBeInTheDocument()
    // Вторая такая же ссылка — у переключателя в шапке: обе ведут на страницу питомцев.
    for (const link of screen.getAllByRole('link', { name: 'Добавить питомца' })) {
      expect(link).toHaveAttribute('href', '/pets')
    }
  })

  it('особенность: добавить, изменить, в архив — с фокусом на списке', async () => {
    const { user } = renderHistory()
    await screen.findByRole('article', { name: 'Аллергия на курицу' })
    await user.click(within(section('Особенности здоровья')).getByRole('button', { name: 'Добавить: особенности здоровья' }))
    let dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('Тип'), 'Хроническое заболевание')
    await user.type(within(dialog).getByLabelText('Название'), 'Гастрит')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }))
    await findStatus('Особенность здоровья добавлена.')
    expect(titles('Особенности здоровья')).toContain('Гастрит')

    await user.click(screen.getByRole('button', { name: 'Изменить, Гастрит' }))
    dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Комментарий'), 'Обострения осенью')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await findStatus('Особенность здоровья сохранена.')
    expect(screen.getByText('Обострения осенью')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'В архив, Гастрит' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'В архив' }))
    await findStatus('Особенность здоровья перенесена в архив.')
    expect(titles('Особенности здоровья')).not.toContain('Гастрит')
    expect(within(section('Особенности здоровья')).getByRole('list').parentElement).toHaveFocus()
  })

  it('наблюдение: добавить и исправить своё', async () => {
    const { user } = renderHistory()
    // Разделы появляются, когда загрузился выбранный питомец.
    await screen.findByRole('region', { name: 'Дневник' })
    await within(section('Дневник')).findByRole('article', { name: '24 октября 2026' })
    await user.click(within(section('Дневник')).getByRole('button', { name: 'Новое наблюдение: дневник' }))
    let dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Дата'), { target: { value: '2026-10-25' } })
    await user.type(within(dialog).getByLabelText('Заметка'), 'Съел всё')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }))
    await findStatus('Наблюдение добавлено.')
    expect(await within(section('Дневник')).findByText('Съел всё')).toBeInTheDocument()
    expect(titles('Дневник')[0]).toBe('25 октября 2026')

    await user.click(screen.getByRole('button', { name: 'Изменить, наблюдение за 25 октября 2026' }))
    dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Вес'), '31')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await findStatus('Наблюдение сохранено.')
    expect(readServer().observations.find((item) => item.note === 'Съел всё')?.weight).toBe(31)
  })

  it('прививка: внести из ветпаспорта и удалить свою', async () => {
    const { user } = renderHistory()
    await screen.findByRole('region', { name: 'Прививки' })
    await within(section('Прививки')).findByRole('article', { name: 'Нобивак Rabies' })
    await user.click(within(section('Прививки')).getByRole('button', { name: 'Внести из ветпаспорта: прививки' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Название'), 'Мультикан')
    fireEvent.change(within(dialog).getByLabelText('Дата прививки'), { target: { value: '2025-09-01' } })
    fireEvent.change(within(dialog).getByLabelText('Следующая прививка'), { target: { value: '2025-08-01' } })
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }))
    expect(within(dialog).getByText('Следующая прививка — позже даты прививки')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Следующая прививка'), { target: { value: '2026-09-01' } })
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }))
    await findStatus('Прививка добавлена.')
    expect(await within(section('Прививки')).findByRole('article', { name: 'Мультикан' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Удалить, Нобивак Rabies' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }))
    await findStatus('Прививка удалена.')
    expect(titles('Прививки')).not.toContain('Нобивак Rabies')
    expect(readServer().vaccinations.some((item) => item.id === 1)).toBe(false)
  })

  it('ошибка загрузки раздела — свой «Повторить», остальные разделы работают', async () => {
    let fail = true
    server.use(
      http.get('*/api/pets/:petId/vaccinations', () =>
        fail ? HttpResponse.json({ detail: 'Ошибка' }, { status: 500 }) : undefined,
      ),
    )
    const { user } = renderHistory()
    expect(await screen.findByText('Не удалось загрузить прививки')).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Аллергия на курицу' })).toBeInTheDocument()
    fail = false
    await user.click(within(section('Прививки')).getByRole('button', { name: 'Повторить' }))
    expect(await within(section('Прививки')).findByRole('article', { name: 'Нобивак Rabies' })).toBeInTheDocument()
  })
})
