import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { setSeedClock } from '../../test/clock'
import { renderRoute } from '../../test/render'

beforeEach(() => setSeedClock('clinic'))

describe('ClinicPetPage', () => {
  it('карточка: данные, особенности, прививки, дневник и приёмы в этой клинике — только чтение', async () => {
    renderRoute('/clinic/pets/10')
    expect(await screen.findByRole('heading', { level: 1, name: 'Майло' })).toBeInTheDocument()
    expect(screen.getByText('Аллергия на курицу')).toBeInTheDocument()
    expect(screen.getByText('Дисплазия тазобедренных суставов')).toBeInTheDocument()
    expect(screen.queryByText('Аллергия на блох')).not.toBeInTheDocument()
    expect(screen.getByText('Нобивак DHPPi')).toBeInTheDocument()
    expect(await screen.findByText(/Хромает на заднюю лапу после прогулки/)).toBeInTheDocument()
    const visits = screen.getByRole('heading', { name: 'Приёмы в вашей клинике' }).closest('div')!
    expect(within(visits).getByText('Итог: Растяжение связок задней лапы')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Изменить/ })).not.toBeInTheDocument()
  })

  it('фото — только после завершённого приёма; формат и размер проверяются до отправки', async () => {
    const view = renderRoute('/clinic/pets/10')
    const input = await screen.findByLabelText('Загрузить фото')
    // user.upload отбросил бы файл по accept — а проверяем как раз сообщение формы.
    fireEvent.change(input, { target: { files: [new File(['не фото'], 'note.txt', { type: 'text/plain' })] } })
    expect(await screen.findByText('Фото — JPEG, PNG или WebP.')).toBeInTheDocument()
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [big] } })
    expect(await screen.findByText('Фото больше 5 МБ — выберите поменьше.')).toBeInTheDocument()
    view.unmount()
    // У Рекса приём в клинике подтверждён, но ещё не прошёл.
    renderRoute('/clinic/pets/13')
    expect(await screen.findByRole('heading', { level: 1, name: 'Рекс' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Загрузить фото')).not.toBeInTheDocument()
  })

  it('без неотменённой записи в клинику — карточка недоступна', async () => {
    renderRoute('/clinic/pets/12')
    expect(await screen.findByText('Карточка недоступна')).toBeInTheDocument()
  })
})
