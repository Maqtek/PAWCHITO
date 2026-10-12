import { describe, expect, it } from 'vitest'
import {
  appointmentStatusLabel,
  appointmentStatusTone,
  careStatusLabel,
  careStatusOrder,
  careStatusTone,
  eventCategoryLabel,
  roleLabel,
  speciesLabel,
} from './labels'

describe('подписи по глоссарию', () => {
  it('статусы ухода — состояния питомца', () => {
    expect(careStatusOrder.map((status) => careStatusLabel[status])).toEqual([
      'В норме',
      'Требует внимания',
      'На лечении',
      'Восстанавливается',
      'На профилактике',
    ])
  })

  it('типы событий не совпадают со статусами ухода', () => {
    expect(Object.values(eventCategoryLabel)).toEqual(['Лечение', 'Уход', 'Профилактика'])
    for (const label of Object.values(eventCategoryLabel)) {
      expect(Object.values(careStatusLabel)).not.toContain(label)
    }
  })

  it('у каждого статуса ухода свой цвет', () => {
    expect(new Set(careStatusOrder.map((status) => careStatusTone[status])).size).toBe(5)
  })

  it('роли, виды и статусы записи', () => {
    expect(roleLabel).toEqual({ owner: 'Владелец', clinic: 'Клиника', admin: 'Администратор' })
    expect(speciesLabel.dog).toBe('Собака')
    expect(appointmentStatusLabel.requested).toBe('Заявка')
    expect(appointmentStatusTone.cancelled).toBe('neutral')
  })
})
