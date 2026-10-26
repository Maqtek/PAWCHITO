import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiBaseUrl } from '../../api/base-url'
import type { Pet, PetArchived } from '../../api/schema'
import { readServer, SEED_PASSWORD } from '../server-state'

function call(method: string, path: string, { body, token }: { body?: unknown; token?: string } = {}) {
  return fetch(`${apiBaseUrl()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function accessToken(email: string): Promise<string> {
  const response = await call('POST', '/auth/login', { body: { email, password: SEED_PASSWORD } })
  return ((await response.json()) as { access_token: string }).access_token
}

const owner = () => accessToken('owner@example.com')

async function fieldsOf(response: Response): Promise<string[]> {
  return ((await response.json()) as { detail: { loc: string[] }[] }).detail.map((item) => item.loc[1]).sort()
}

const petInState = (id: number) => readServer().pets.find((pet) => pet.id === id)

afterEach(() => {
  vi.useRealTimers()
})

describe('питомцы: доступ', () => {
  it('гость — 401, клиника и администратор — 403', async () => {
    expect((await call('GET', '/pets')).status).toBe(401)
    expect((await call('GET', '/pets', { token: await accessToken('clinic@example.com') })).status).toBe(403)
    expect((await call('GET', '/pets', { token: await accessToken('admin@example.com') })).status).toBe(403)
    expect((await call('POST', '/pets', { token: await accessToken('admin@example.com'), body: {} })).status).toBe(403)
  })
})

describe('питомцы: список', () => {
  it('только свои и только активные, в порядке добавления; archived=true — архивные', async () => {
    const token = await owner()
    const active = (await (await call('GET', '/pets', { token })).json()) as Pet[]
    expect(active.map((pet) => pet.name)).toEqual(['Майло', 'Барсик'])
    const archived = (await (await call('GET', '/pets?archived=true', { token })).json()) as Pet[]
    expect(archived.map((pet) => pet.name)).toEqual(['Кеша'])
  })
})

describe('питомцы: добавление', () => {
  it('422 по всем полям сразу', async () => {
    const response = await call('POST', '/pets', {
      token: await owner(),
      body: { name: '  ', species: 'hamster', breed: 5, birth_date: '2022-5-1', sex: 'boy' },
    })
    expect(response.status).toBe(422)
    expect(await fieldsOf(response)).toEqual(['birth_date', 'breed', 'name', 'sex', 'species'])
  })

  it('кличка — до 50 символов Unicode; порода — до 100; управляющие символы и тело не JSON — 422', async () => {
    const token = await owner()
    const base = { species: 'cat' }
    expect((await call('POST', '/pets', { token, body: { ...base, name: '🐱'.repeat(50) } })).status).toBe(201)
    expect((await call('POST', '/pets', { token, body: { ...base, name: '🐱'.repeat(51) } })).status).toBe(422)
    expect((await call('POST', '/pets', { token, body: { ...base, name: 'Бас', breed: 'х'.repeat(101) } })).status).toBe(422)
    expect((await call('POST', '/pets', { token, body: { ...base, name: 'Бас\u0007ик' } })).status).toBe(422)
    const notJson = await fetch(`${apiBaseUrl()}/pets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: 'не json',
    })
    expect(notJson.status).toBe(422)
  })

  it('дата рождения: строго ГГГГ-ММ-ДД, существующая, с 1900-01-01 по сегодня в Москве', async () => {
    // 01:30 27 октября по Москве: в UTC ещё 26-е, а сегодня для сервера — уже 27-е.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-26T22:30:00Z'))
    const token = await owner()
    const status = async (birth_date: unknown) =>
      (await call('POST', '/pets', { token, body: { name: 'Бублик', species: 'dog', birth_date } })).status
    expect(await status('2026-10-27')).toBe(201)
    expect(await status('2026-10-28')).toBe(422)
    expect(await status('1900-01-01')).toBe(201)
    expect(await status('1899-12-31')).toBe(422)
    expect(await status('0202-05-01')).toBe(422)
    expect(await status('2022-02-30')).toBe(422)
    expect(await status('2022-05-01T00:00:00')).toBe(422)
    expect(await status(null)).toBe(201)
  })

  it('201: пробелы обрезаны, пустая порода — null, пол по умолчанию unknown, фото и статус из тела не берутся', async () => {
    const response = await call('POST', '/pets', {
      token: await owner(),
      body: { name: '  Бублик ', species: 'other', breed: '   ', photo_url: '/media/x.webp', care_status: 'routine' },
    })
    expect(response.status).toBe(201)
    const pet = (await response.json()) as Pet
    expect(pet).toMatchObject({
      owner_id: 1,
      name: 'Бублик',
      species: 'other',
      breed: null,
      birth_date: null,
      sex: 'unknown',
      photo_url: null,
      care_status: null,
      archived_at: null,
    })
    expect(petInState(pet.id)).toEqual(pet)
  })
})

describe('питомцы: изменение', () => {
  it('меняются только присланные поля; пустое тело — 200 без изменений; фото и статус игнорируются', async () => {
    const token = await owner()
    const before = petInState(11)
    expect(await (await call('PATCH', '/pets/11', { token, body: {} })).json()).toEqual(before)
    const renamed = await call('PATCH', '/pets/11', {
      token,
      body: { name: ' Барсик II ', sex: 'female', photo_url: '/media/x.webp', care_status: 'routine' },
    })
    expect(await renamed.json()).toMatchObject({
      name: 'Барсик II',
      sex: 'female',
      breed: 'Британская короткошёрстная',
      photo_url: null,
      care_status: null,
    })
  })

  it('null убирает породу и дату рождения, а в кличке, виде и поле — 422', async () => {
    const token = await owner()
    const cleared = await call('PATCH', '/pets/11', { token, body: { breed: null, birth_date: null } })
    expect(await cleared.json()).toMatchObject({ breed: null, birth_date: null })
    const invalid = await call('PATCH', '/pets/11', { token, body: { name: null, species: null, sex: null } })
    expect(invalid.status).toBe(422)
    expect(await fieldsOf(invalid)).toEqual(['name', 'sex', 'species'])
  })

  it('архивного питомца можно получить и изменить', async () => {
    const token = await owner()
    expect((await call('GET', '/pets/12', { token })).status).toBe(200)
    expect(await (await call('PATCH', '/pets/12', { token, body: { name: 'Кеша-старший' } })).json()).toMatchObject({
      name: 'Кеша-старший',
    })
  })
})

describe('питомцы: архив', () => {
  it('питомец пропадает из списка; отменять и удалять в моках нечего; повтор — 200 без изменений', async () => {
    const token = await owner()
    const response = await call('POST', '/pets/10/archive', { token })
    expect(response.status).toBe(200)
    const result = (await response.json()) as PetArchived
    expect(result).toMatchObject({ pet: { id: 10 }, cancelled_appointments: 0, deleted_reminders: 0 })
    expect(result.pet.archived_at).not.toBeNull()
    const list = (await (await call('GET', '/pets', { token })).json()) as Pet[]
    expect(list.map((pet) => pet.id)).toEqual([11])

    const again = (await (await call('POST', '/pets/10/archive', { token })).json()) as PetArchived
    expect(again.pet.archived_at).toBe(result.pet.archived_at)
    expect(again).toMatchObject({ cancelled_appointments: 0, deleted_reminders: 0 })
  })
})

describe('чужие питомцы', () => {
  it('просмотр, изменение и архив — 404, как у несуществующего; питомец не меняется', async () => {
    const token = await owner()
    const before = petInState(13)
    for (const [method, path, body] of [
      ['GET', '/pets/13', undefined],
      ['PATCH', '/pets/13', { name: 'Мой' }],
      ['POST', '/pets/13/archive', undefined],
      ['GET', '/pets/999', undefined],
      ['GET', '/pets/abc', undefined],
    ] as const) {
      const response = await call(method, path, { token, body })
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ detail: 'Питомец не найден' })
    }
    expect(petInState(13)).toEqual(before)
  })

  it('сначала тело (422), потом поиск питомца (404)', async () => {
    expect((await call('PATCH', '/pets/13', { token: await owner(), body: { name: '' } })).status).toBe(422)
  })
})
