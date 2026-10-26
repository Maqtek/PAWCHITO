import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Observation } from '../../api/schema'
import { readServer } from '../../mocks/server-state'
import { renderWithProviders } from '../../test/render'
import { recordRequests } from '../../test/requests'
import { ObservationFormModal } from './ObservationFormModal'
import { parseWeight } from './weight'

const seedObservation = (id: number) => {
  const observation = readServer().observations.find((item) => item.id === id)
  if (!observation) throw new Error(`В seed нет наблюдения ${id}`)
  return observation
}

function renderForm(observation?: Observation) {
  const onSaved = vi.fn()
  const onClose = vi.fn()
  const result = renderWithProviders(
    <ObservationFormModal open petId={10} observation={observation} onClose={onClose} onSaved={onSaved} />,
  )
  return { ...result, onSaved, onClose, dialog: screen.getByRole('dialog') }
}

/** Запросы добавления (post) или правки (patch) наблюдения; уходят дальше, в мок дневника. */
const recordObservations = (method: 'post' | 'patch') =>
  recordRequests(method, method === 'post' ? '*/api/pets/:petId/observations' : '*/api/pets/:petId/observations/:id')

describe('parseWeight', () => {
  it.each([
    ['', null],
    ['4,2', 4.2],
    ['4.25', 4.25],
    ['0,1', 0.1],
    ['200', 200],
    ['0,05', undefined],
    ['200,5', undefined],
    ['4,255', undefined],
    ['4 кг', undefined],
  ])('«%s» → %s', (text, expected) => {
    expect(parseWeight(text)).toBe(expected)
  })
})

describe('ObservationFormModal', () => {
  it('новое: дата — сегодня; без полей кроме даты — ошибка у веса, запроса нет', async () => {
    const posts = recordObservations('post')
    const { user, dialog } = renderForm()
    expect(within(dialog).getByLabelText('Дата')).not.toHaveValue('')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }))
    expect(within(dialog).getByLabelText('Вес')).toHaveFocus()
    expect(within(dialog).getByText('Заполните хотя бы одно поле, кроме даты')).toBeInTheDocument()
    expect(posts.bodies).toEqual([])
  })

  it('вес с запятой уходит числом, пустые поля — null', async () => {
    const posts = recordObservations('post')
    const { user, dialog, onSaved } = renderForm()
    fireEvent.change(within(dialog).getByLabelText('Дата'), { target: { value: '2026-10-25' } })
    await user.type(within(dialog).getByLabelText('Вес'), '31,25')
    await user.selectOptions(within(dialog).getByLabelText('Аппетит'), 'Ниже обычного')
    await user.type(within(dialog).getByLabelText('Симптомы'), '   ')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(posts.bodies).toEqual([
      { date: '2026-10-25', weight: 31.25, appetite: 'low', energy: null, symptoms: null, note: null },
    ])
  })

  it('неверный вес и дата в будущем — ошибки у полей', async () => {
    const { user, dialog } = renderForm()
    fireEvent.change(within(dialog).getByLabelText('Дата'), { target: { value: '2999-01-01' } })
    await user.type(within(dialog).getByLabelText('Вес'), '4,255')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить' }))
    expect(within(dialog).getByText('Дата — не позже сегодняшнего дня')).toBeInTheDocument()
    expect(within(dialog).getByText('Вес — число от 0,1 до 200 кг, не больше двух знаков после запятой')).toBeInTheDocument()
  })

  it('правка своего: поля заполнены, уходят только изменённые; стёртая заметка — null', async () => {
    const patches = recordObservations('patch')
    const { user, dialog, onSaved } = renderForm(seedObservation(3))
    expect(within(dialog).getByRole('heading', { name: 'Изменить наблюдение' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Вес')).toHaveValue('31,2')
    expect(within(dialog).getByLabelText('Энергия')).toHaveValue('normal')
    await user.clear(within(dialog).getByLabelText('Вес'))
    await user.type(within(dialog).getByLabelText('Вес'), '3,12')
    await user.clear(within(dialog).getByLabelText('Заметка'))
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(patches.bodies).toEqual([{ weight: 3.12, note: null }])
  })
})
