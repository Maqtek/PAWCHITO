import { describe, expect, it } from 'vitest'
import { homePathFor, navigation } from './navigation'

describe('навигация по ролям (БП §11)', () => {
  it('владелец: пять разделов макета', () => {
    expect(navigation.owner.map((item) => item.label)).toEqual([
      'Главная',
      'Дела',
      'Курс лечения',
      'История',
      'Записи к врачу',
    ])
  })

  it('клиника и администратор', () => {
    expect(navigation.clinic.map((item) => item.label)).toEqual(['Записи', 'Врачи'])
    expect(navigation.admin.map((item) => item.label)).toEqual(['Клиники'])
  })

  it('домашняя страница роли — первый пункт меню', () => {
    expect(homePathFor('owner')).toBe('/')
    expect(homePathFor('clinic')).toBe('/clinic/appointments')
    expect(homePathFor('admin')).toBe('/admin/clinics')
  })
})
