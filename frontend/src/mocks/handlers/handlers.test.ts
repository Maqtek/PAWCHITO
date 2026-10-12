import { describe, expect, it } from 'vitest'
import { api } from '../../api/client'
import { getMockRole, setMockRole } from '../session'

describe('моки API', () => {
  it('по умолчанию входит владельцем', async () => {
    const { data } = await api.GET('/users/me')
    expect(data?.role).toBe('owner')
  })

  it('роль меняется через setMockRole', async () => {
    setMockRole('clinic')
    const { data } = await api.GET('/users/me')
    expect(data?.full_name).toBe('ВетДоктор')
  })

  it('гость получает 401', async () => {
    setMockRole('guest')
    const { response } = await api.GET('/users/me')
    expect(response.status).toBe(401)
  })

  it('питомцы доступны только владельцу', async () => {
    setMockRole('clinic')
    const { response } = await api.GET('/pets')
    expect(response.status).toBe(403)
  })

  it('владелец видит своих активных питомцев', async () => {
    const { data } = await api.GET('/pets')
    expect(data?.map((pet) => pet.name)).toEqual(['Майло', 'Барсик'])
  })

  it('счётчик непрочитанных уведомлений', async () => {
    const { data } = await api.GET('/notifications/unread-count')
    expect(data).toEqual({ unread_count: 3 })
  })

  it('выход переводит моки в гостя', async () => {
    await api.POST('/auth/logout')
    expect(getMockRole()).toBe('guest')
  })
})
