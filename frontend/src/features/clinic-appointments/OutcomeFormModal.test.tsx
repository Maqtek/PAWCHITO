import { fireEvent, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../app/routes'
import { server } from '../../mocks/node'
import { readServer } from '../../mocks/server-state'
import { loginMockAs, resetMockServer } from '../../mocks/session'
import { renderWithProviders } from '../../test/render'

/** role="status" есть и у спиннеров, поэтому статус страницы ищем по тексту и проверяем, что он в live-регионе. */
async function findStatus(text: string) {
  const message = await screen.findByText(text)
  expect(message.closest('[role="status"]')).not.toBeNull()
  return message
}

// Seed пересчитан от среды 28 октября 2026; затем часы — на пятницу 30.10, 10:30: приём №20 Майло (10:00) и №25 Рекса
// (10:30) подтверждены и ждут итога.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-28T06:00:00Z'))
  resetMockServer()
  loginMockAs('clinic')
  vi.setSystemTime(new Date('2026-10-30T07:30:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

async function openOutcome() {
  const view = renderWithProviders(<AppRoutes />, { route: '/clinic/appointments?view=awaiting' })
  await view.user.click(await screen.findByRole('button', { name: 'Внести итог, Майло, пятница, 30 октября, 10:00' }))
  return { ...view, dialog: screen.getByRole('dialog', { name: 'Итог приёма' }) }
}

describe('форма итога приёма', () => {
  it('без заключения и статуса — ошибки у полей, фокус на заключении, запроса нет', async () => {
    const { user, dialog } = await openOutcome()
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить итог' }))
    expect(within(dialog).getByLabelText('Заключение')).toHaveFocus()
    expect(within(dialog).getByText('Напишите заключение')).toBeInTheDocument()
    expect(within(dialog).getByText('Выберите статус ухода')).toBeInTheDocument()
    expect(readServer().appointments.find((item) => item.id === 20)?.status).toBe('confirmed')
  })

  it('рецепт: ошибки строки — у её полей, первая неверная получает фокус', async () => {
    const { user, dialog } = await openOutcome()
    await user.type(within(dialog).getByLabelText('Заключение'), 'Отит')
    await user.selectOptions(within(dialog).getByLabelText('Статус ухода'), 'На лечении')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить рецепт' }))
    await user.type(within(dialog).getByLabelText('Препарат'), 'Амоксициллин')
    await user.type(within(dialog).getByLabelText('Время приёма'), '9 утра')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить итог' }))
    expect(within(dialog).getByLabelText('Дозировка')).toHaveFocus()
    expect(within(dialog).getByText('Время ЧЧ:ММ через запятую, от 1 до 6')).toBeInTheDocument()
  })

  it('ответ 422 — ошибки по путям у полей своей строки, фокус на первом неверном', async () => {
    server.use(
      http.post('*/api/clinic/appointments/:id/outcome', () =>
        HttpResponse.json(
          {
            detail: [
              { loc: ['body', 'prescriptions', 0, 'times'], msg: 'Неверное время приёма', type: 'value_error' },
              { loc: ['body', 'vaccinations', 0, 'date'], msg: 'Неверная дата прививки', type: 'value_error' },
            ],
          },
          { status: 422 },
        ),
      ),
    )
    const { user, dialog } = await openOutcome()
    await user.type(within(dialog).getByLabelText('Заключение'), 'Отит')
    await user.selectOptions(within(dialog).getByLabelText('Статус ухода'), 'На лечении')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить рецепт' }))
    await user.type(within(dialog).getByLabelText('Препарат'), 'Отипакс')
    await user.type(within(dialog).getByLabelText('Дозировка'), '2 капли')
    await user.type(within(dialog).getByLabelText('Время приёма'), '09:00')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить прививку' }))
    await user.click(within(dialog).getByRole('button', { name: 'Добавить прививку' }))
    const [firstName, secondName] = within(dialog).getAllByLabelText('Название прививки')
    await user.type(firstName, 'Рабис')
    await user.type(secondName, 'DHPPi')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить итог' }))

    expect(await within(dialog).findByText('Проверьте поля формы.')).toBeInTheDocument()
    const times = within(dialog).getByLabelText('Время приёма')
    expect(times).toHaveFocus()
    expect(times).toHaveAccessibleDescription('Неверное время приёма Через запятую: 09:00, 21:00')
    // Ошибка прививки — у даты её строки: не у даты начала рецепта и не у соседней прививки.
    const [firstDate, secondDate] = within(dialog).getAllByLabelText('Дата прививки')
    expect(firstDate).toHaveAccessibleDescription('Неверная дата прививки')
    expect(secondDate).not.toHaveAttribute('aria-invalid')
    expect(within(dialog).getByLabelText('Начало')).not.toHaveAttribute('aria-invalid')
    // Правка поля убирает его серверную ошибку, остальные остаются.
    await user.clear(times)
    await user.type(times, '10:00')
    expect(times).not.toHaveAttribute('aria-invalid')
    expect(firstDate).toHaveAttribute('aria-invalid', 'true')
    expect(readServer().appointments.find((item) => item.id === 20)?.status).toBe('confirmed')
  })

  it('итог сохранён: статус с делами курса, запись ушла из «Ждут итога», данные питомца — из карточки', async () => {
    const { user, dialog } = await openOutcome()
    // Текущие данные питомца подставлены из карточки.
    await vi.waitFor(() => expect(within(dialog).getByLabelText('Порода')).toHaveValue('Золотистый ретривер'))
    await user.type(within(dialog).getByLabelText('Заключение'), 'Отит правого уха')
    await user.selectOptions(within(dialog).getByLabelText('Статус ухода'), 'На лечении')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить рецепт' }))
    await user.type(within(dialog).getByLabelText('Препарат'), 'Амоксициллин')
    await user.type(within(dialog).getByLabelText('Дозировка'), '1 таблетка 250 мг')
    await user.type(within(dialog).getByLabelText('Время приёма'), '09:00, 21:00')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить прививку' }))
    await user.type(within(dialog).getByLabelText('Название прививки'), 'Рабис')
    fireEvent.change(within(dialog).getByLabelText('Следующая прививка'), { target: { value: '2027-10-30' } })
    await user.type(within(dialog).getByLabelText('Вес'), '31,4')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить итог' }))

    await findStatus('Итог внесён: Майло — на лечении. Дел курса: 13. Владелец получит уведомление.')
    expect(screen.queryByRole('article', { name: 'пятница, 30 октября, 10:00' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Ждут итога (1)' })).toBeInTheDocument()
    const state = readServer()
    expect(state.appointments.find((item) => item.id === 20)?.outcome).toMatchObject({
      prescriptions: [{ times: ['09:00', '21:00'], duration_days: 7, start_date: '2026-10-30' }],
      vaccinations: [{ name: 'Рабис', next_date: '2027-10-30' }],
    })
    // Порода не менялась — в pet_update её нет; вес — наблюдение клиники.
    expect(state.observations.at(-1)).toMatchObject({ weight: 31.4, source: 'clinic' })
    expect(state.notifications.at(-1)?.text).toBe('Клиника «ВетДоктор» обновила данные питомца Майло: вес')
  })
})
