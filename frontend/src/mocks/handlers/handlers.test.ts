import { describe, expect, it } from 'vitest'
import { api } from '../../api/client'
import { loginMockAs, logoutMock, readMockCookie } from '../session'

describe('моки API', () => {
  it('по умолчанию в тестах вошёл владелец', async () => {
    const { data } = await api.GET('/users/me')
    expect(data?.role).toBe('owner')
  })

  it('loginMockAs входит другим аккаунтом', async () => {
    loginMockAs('clinic')
    const { data } = await api.GET('/users/me')
    expect(data?.full_name).toBe('ВетДоктор')
  })

  it('гость получает 401', async () => {
    logoutMock()
    const { response } = await api.GET('/users/me')
    expect(response.status).toBe(401)
  })

  it('питомцы доступны только владельцу', async () => {
    loginMockAs('clinic')
    const { response } = await api.GET('/pets')
    expect(response.status).toBe(403)
  })

  it('владелец видит своих активных питомцев', async () => {
    const { data } = await api.GET('/pets')
    expect(data?.map((pet) => pet.name)).toEqual(['Майло', 'Барсик'])
  })

  it('новый владелец не видит чужих питомцев', async () => {
    const { data: registered } = await api.POST('/auth/register', {
      body: { email: 'new@example.com', password: 'secret123', full_name: 'Новый Владелец' },
    })
    expect(registered?.user.role).toBe('owner')
    const { data } = await api.GET('/pets')
    expect(data).toEqual([])
  })

  it('счётчик непрочитанных уведомлений', async () => {
    const { data } = await api.GET('/notifications/unread-count')
    expect(data).toEqual({ unread_count: 3 })
  })

  it('выход стирает cookie', async () => {
    await api.POST('/auth/logout')
    expect(readMockCookie()).toBeNull()
  })
})
