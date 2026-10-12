import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../../test/render'
import { useSelectedPet } from './useSelectedPet'

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
    expect(localStorage.getItem('pawchito:selected-pet-id')).toBe('11')
  })

  it('неизвестный сохранённый id — берётся первый питомец', async () => {
    localStorage.setItem('pawchito:selected-pet-id', '999')
    renderWithProviders(<Probe label="A" />)
    expect(await screen.findByText('A: Майло')).toBeInTheDocument()
  })
})
