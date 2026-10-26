import { fireEvent, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../mocks/node'
import { readServer } from '../../mocks/server-state'
import { setSeedClock } from '../../test/clock'
import { renderRoute } from '../../test/render'

const renderWizard = () => renderRoute('/appointments/new')
const times = () => within(screen.getByRole('list', { name: 'Свободное время' })).getAllByRole('button').map((button) => button.textContent)

// Среда, 28 октября 2026, 09:00 по Москве; seed записей пересчитан от этой даты.
beforeEach(() => setSeedClock('owner'))

/** Клиника → врач: шаги, общие для всех сценариев. */
async function pickVet(user: ReturnType<typeof renderWizard>['user'], vet = 'Петров Павел Петрович') {
  await user.click(await screen.findByRole('button', { name: 'Выбрать: ВетДоктор' }))
  expect(await screen.findByRole('heading', { name: 'Шаг 2 из 4. Врач' })).toHaveFocus()
  // Соколова в отпуске — её не предлагают.
  expect(screen.queryByText('Соколова Мария Андреевна')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: `Выбрать: ${vet}` }))
  expect(await screen.findByRole('heading', { name: 'Шаг 3 из 4. Время' })).toHaveFocus()
}

describe('мастер записи', () => {
  it('клиника → врач → время → причина: заявка создана, переход на страницу записи', async () => {
    const { user } = renderWizard()
    expect(await screen.findByText('Пн–Сб, 09:00–20:00')).toBeInTheDocument()
    // Скрытая «Айболит» в список не попадает.
    expect(screen.queryByText('Айболит')).not.toBeInTheDocument()
    await pickVet(user)

    // Сегодня — только ещё не начавшееся время.
    expect(screen.getByLabelText('Дата')).toHaveValue('2026-10-28')
    expect((await screen.findAllByRole('button', { name: '09:30' })).length).toBe(1)
    expect(times()[0]).toBe('09:30')
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-10-30' } })
    await screen.findByRole('button', { name: '09:00' })
    expect(times()).not.toContain('10:00')
    expect(times()).not.toContain('10:30')
    await user.click(screen.getByRole('button', { name: '11:00' }))

    expect(await screen.findByRole('heading', { name: 'Шаг 4 из 4. Причина и подтверждение' })).toHaveFocus()
    // С заглавной буква становится только в CSS (first-letter), в тексте — как отдаёт Intl.
    expect(screen.getByText('пятница, 30 октября, 11:00')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Записаться' }))
    expect(screen.getByLabelText('Причина обращения')).toHaveAccessibleDescription('Выберите причину обращения')
    await user.selectOptions(screen.getByLabelText('Причина обращения'), 'Заболевание')
    await user.type(screen.getByLabelText('Комментарий для клиники'), 'Чешет ухо')
    await user.selectOptions(screen.getByLabelText('Питомец'), 'Барсик')
    await user.click(screen.getByRole('button', { name: 'Записаться' }))

    expect(await screen.findByText('Заявка отправлена. Клиника подтвердит запись — статус появится здесь.')).toBeInTheDocument()
    expect(screen.getByText('Заболевание: Чешет ухо')).toBeInTheDocument()
    expect(readServer().appointments.at(-1)).toMatchObject({
      pet_id: 11,
      vet_id: 4,
      slot_start: '2026-10-30T11:00:00+03:00',
      reason: 'illness',
      status: 'requested',
    })
  })

  it('воскресенье — клиника не работает; без запроса слотов', async () => {
    const { user } = renderWizard()
    await pickVet(user, 'Ким Елена Викторовна')
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-11-01' } })
    expect(screen.getByText('Клиника не работает в этот день — выберите другую дату.')).toBeInTheDocument()
  })

  it('время заняли, пока заполняли причину, — назад к выбору времени с сообщением, слоты перечитаны', async () => {
    const { user } = renderWizard()
    await pickVet(user)
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-10-30' } })
    await user.click(await screen.findByRole('button', { name: '11:00' }))
    await screen.findByRole('heading', { name: 'Шаг 4 из 4. Причина и подтверждение' })
    // Другой владелец успел раньше.
    server.use(
      http.post('*/api/appointments', () => HttpResponse.json({ detail: 'Слот уже занят' }, { status: 409 }), { once: true }),
    )
    await user.selectOptions(screen.getByLabelText('Причина обращения'), 'Плановый осмотр')
    await user.click(screen.getByRole('button', { name: 'Записаться' }))
    expect(await screen.findByRole('heading', { name: 'Шаг 3 из 4. Время' })).toHaveFocus()
    expect(screen.getByRole('alert')).toHaveTextContent('Это время только что заняли. Выберите другое.')
    expect(screen.getByLabelText('Дата')).toHaveValue('2026-10-30')
  })

  it('«Другой врач» и «Другая клиника» возвращают на прошлые шаги', async () => {
    const { user } = renderWizard()
    await pickVet(user)
    await user.click(screen.getByRole('button', { name: 'Другой врач' }))
    expect(await screen.findByRole('heading', { name: 'Шаг 2 из 4. Врач' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Другая клиника' }))
    expect(await screen.findByRole('heading', { name: 'Шаг 1 из 4. Клиника' })).toHaveFocus()
  })
})
