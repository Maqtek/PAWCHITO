import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Pet } from '../../api/schema'
import { PetIllustration } from '../illustrations/PetIllustration'
import { CareStatusScale } from './CareStatusScale'
import { PetCard } from './PetCard'

const milo: Pet = {
  id: 10,
  owner_id: 1,
  name: 'Майло',
  species: 'dog',
  breed: 'Золотистый ретривер',
  birth_date: '2022-05-01',
  sex: 'male',
  photo_url: null,
  care_status: 'treatment',
  care_status_set_at: '2026-10-10T10:40:00+03:00',
  care_status_clinic: { id: 2, name: 'ВетДоктор' },
  archived_at: null,
}

describe('PetIllustration', () => {
  it('подписана видом и кличкой', () => {
    render(<PetIllustration species="dog" name="Майло" />)
    expect(screen.getByRole('img', { name: 'Собака Майло' })).toBeInTheDocument()
  })

  it('без клички — только вид', () => {
    render(<PetIllustration species="cat" />)
    expect(screen.getByRole('img', { name: 'Кошка' })).toBeInTheDocument()
  })

  it('у собаки, кошки и другого животного — свой рисунок и фон', () => {
    render(
      <>
        <PetIllustration species="dog" />
        <PetIllustration species="cat" />
        <PetIllustration species="other" />
      </>,
    )
    const images = ['Собака', 'Кошка', 'Другое'].map((name) => screen.getByRole('img', { name }))
    expect(new Set(images.map((image) => image.innerHTML)).size).toBe(3)
    expect(new Set(images.map((image) => image.className)).size).toBe(3)
  })
})

describe('CareStatusScale', () => {
  it('показывает пять статусов и отмечает текущий', () => {
    render(<CareStatusScale status="treatment" />)
    const list = screen.getByRole('list', { name: 'Статус ухода' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(5)
    expect(within(list).getByText('На лечении').closest('li')).toHaveAttribute('aria-current', 'true')
    expect(within(list).getByText('В норме').closest('li')).not.toHaveAttribute('aria-current')
  })

  it('до первого приёма статуса нет', () => {
    render(<CareStatusScale status={null} />)
    expect(screen.getByText('Статус появится после приёма в клинике')).toBeInTheDocument()
  })
})

describe('PetCard', () => {
  it('кличка, вид, порода с возрастом, статус и клиника', () => {
    render(<PetCard pet={milo} today={new Date('2026-10-12T12:00:00Z')} />)
    expect(screen.getByRole('heading', { name: 'Майло' })).toBeInTheDocument()
    expect(screen.getByText('Собака')).toBeInTheDocument()
    // getByText схлопывает пробелы, поэтому неразрывный проверяем по textContent.
    expect(screen.getByText(/Золотистый ретривер/).textContent).toBe('Золотистый ретривер · 4\u00A0года')
    // статус в строке под кличкой и в шкале
    expect(screen.getAllByText('На лечении')).toHaveLength(2)
  })

  it('клиника и дата на узком экране переносятся целиком, без висящей «·»', () => {
    render(<PetCard pet={milo} today={new Date('2026-10-12T12:00:00Z')} />)
    const suffix = screen.getByText('ВетДоктор, 10 октября')
    expect(suffix).toHaveClass('basis-full', 'sm:basis-auto')
    const separator = suffix.querySelector('[aria-hidden="true"]')
    expect(separator).toHaveClass('hidden', 'sm:inline')
    expect(separator).toHaveTextContent('·')
  })

  it('фото от клиники вместо иллюстрации', () => {
    render(<PetCard pet={{ ...milo, photo_url: '/media/milo.webp' }} today={new Date('2026-10-12T12:00:00Z')} />)
    expect(screen.getByRole('img', { name: 'Майло' })).toHaveAttribute('src', '/media/milo.webp')
  })
})
