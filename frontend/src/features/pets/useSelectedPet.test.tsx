import { act, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../../test/render'
import { SELECTED_PET_KEY } from '../../test/storage-keys'
import { forgetSelectedPet, useSelectedPet } from './useSelectedPet'

function Probe({ label }: { label: string }) {
  const { pet, pets, select } = useSelectedPet()
  return (
    <div>
      <p>
        {label}: {pet?.name ?? 'нет'}
      </p>
      {pets.map((item) => (
        <button key={item.id} type="button" onClick={() => select(item.id)}>
          {label} выбрать {item.name}
        </button>
      ))}
    </div>
  )
}

describe('useSelectedPet', () => {
  it('по умолчанию первый питомец; выбор общий и сохраняется', async () => {
    const { user } = renderWithProviders(
      <>
        <Probe label="A" />
        <Probe label="B" />
      </>,
    )
    expect(await screen.findByText('A: Майло')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'A выбрать Барсик' }))

    expect(screen.getByText('B: Барсик')).toBeInTheDocument()
    expect(localStorage.getItem(SELECTED_PET_KEY)).toBe('11')
  })

  it('forgetSelectedPet стирает выбор и возвращает подписчиков к первому питомцу', async () => {
    const { user } = renderWithProviders(<Probe label="A" />)
    await user.click(await screen.findByRole('button', { name: 'A выбрать Барсик' }))
    expect(screen.getByText('A: Барсик')).toBeInTheDocument()

    act(() => forgetSelectedPet())

    expect(localStorage.getItem(SELECTED_PET_KEY)).toBeNull()
    expect(screen.getByText('A: Майло')).toBeInTheDocument()
  })

  it('неизвестный сохранённый id — берётся первый питомец', async () => {
    localStorage.setItem(SELECTED_PET_KEY, '999')
    renderWithProviders(<Probe label="A" />)
    expect(await screen.findByText('A: Майло')).toBeInTheDocument()
  })
})
