import { describe, expect, it } from 'vitest'
import { apiBaseUrl } from '../../api/base-url'
import type { Vet } from '../../api/schema'
import { readServer, SEED_PASSWORD, updateServer } from '../server-state'

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

const clinic = () => accessToken('clinic@example.com')

async function fieldsOf(response: Response): Promise<string[]> {
  return ((await response.json()) as { detail: { loc: string[] }[] }).detail.map((item) => item.loc[1]).sort()
}

const vetInState = (id: number) => readServer().vets.find((vet) => vet.id === id)

/** Аккаунт клиники «Зоовет» (4): в seed его нет, а врач у клиники есть. */
function addZoovetAccount() {
  updateServer((state) => {
    state.accounts.push({
      id: state.nextUserId,
      email: 'zoovet@example.com',
      password: SEED_PASSWORD,
      role: 'clinic',
      full_name: '',
      must_change_password: false,
      is_active: true,
      recovery_code: null,
      clinic_id: 4,
    })
    state.nextUserId += 1
  })
}

describe('врачи: доступ', () => {
  it('гость — 401, владелец и администратор — 403', async () => {
    expect((await call('GET', '/clinic/vets')).status).toBe(401)
    expect((await call('GET', '/clinic/vets', { token: await accessToken('owner@example.com') })).status).toBe(403)
    expect((await call('GET', '/clinic/vets', { token: await accessToken('admin@example.com') })).status).toBe(403)
    expect((await call('POST', '/clinic/vets', { token: await accessToken('admin@example.com'), body: {} })).status).toBe(403)
  })

  it('клиника с временным паролем — 403 password_change_required', async () => {
    const response = await call('GET', '/clinic/vets', { token: await accessToken('clinic-new@example.com') })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ detail: 'password_change_required' })
  })
})

describe('врачи: список', () => {
  it('только своя клиника; без параметра — активные, с include_archived — и архивные', async () => {
    const token = await clinic()
    const activeOnly = (await (await call('GET', '/clinic/vets', { token })).json()) as Vet[]
    expect(activeOnly.map((vet) => vet.id)).toEqual([4, 5, 6])
    const all = (await (await call('GET', '/clinic/vets?include_archived=true', { token })).json()) as Vet[]
    expect(all.map((vet) => vet.id)).toEqual([4, 5, 6, 7])
    expect(all.every((vet) => vet.clinic_id === 2)).toBe(true)
    expect(all[0]).toEqual({
      id: 4,
      clinic_id: 2,
      full_name: 'Петров Павел Петрович',
      specialization: 'терапевт',
      on_vacation: false,
      archived_at: null,
    })
  })

  it('другая клиника видит только своих врачей', async () => {
    addZoovetAccount()
    const list = (await (await call('GET', '/clinic/vets?include_archived=true', { token: await accessToken('zoovet@example.com') })).json()) as Vet[]
    expect(list.map((vet) => vet.full_name)).toEqual(['Белова Ольга Игоревна'])
  })
})

describe('врачи: добавление', () => {
  it('422 по всем полям сразу', async () => {
    const response = await call('POST', '/clinic/vets', {
      token: await clinic(),
      body: { full_name: '   ', specialization: 'х'.repeat(101) },
    })
    expect(response.status).toBe(422)
    expect(await fieldsOf(response)).toEqual(['full_name', 'specialization'])
  })

  it('не строки, управляющие символы, тело не JSON — 422', async () => {
    const token = await clinic()
    const types = await call('POST', '/clinic/vets', { token, body: { full_name: 5, specialization: false } })
    expect(await fieldsOf(types)).toEqual(['full_name', 'specialization'])
    const control = await call('POST', '/clinic/vets', { token, body: { full_name: 'Петров\u0007', specialization: 'тера\nпевт' } })
    expect(await fieldsOf(control)).toEqual(['full_name', 'specialization'])
    const notJson = await fetch(`${apiBaseUrl()}/clinic/vets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{',
    })
    expect(await fieldsOf(notJson)).toEqual(['full_name'])
  })

  it('длина — в символах Unicode: 100 эмодзи проходят, 101 — нет', async () => {
    const token = await clinic()
    expect((await call('POST', '/clinic/vets', { token, body: { full_name: '🐾'.repeat(100) } })).status).toBe(201)
    expect((await call('POST', '/clinic/vets', { token, body: { full_name: '🐾'.repeat(101) } })).status).toBe(422)
  })

  it('201: пробелы обрезаны, пустая специализация — null, отпуск из тела не берётся, врач своей клиники', async () => {
    const token = await clinic()
    const created = await call('POST', '/clinic/vets', {
      token,
      body: { full_name: '  Иванова Анна  ', specialization: '   ', on_vacation: true, clinic_id: 4 },
    })
    expect(created.status).toBe(201)
    const vet = (await created.json()) as Vet
    expect(vet).toEqual({
      id: 100,
      clinic_id: 2,
      full_name: 'Иванова Анна',
      specialization: null,
      on_vacation: false,
      archived_at: null,
    })
    // ФИО не уникально: тёзку добавить можно; без специализации — null.
    const namesake = await call('POST', '/clinic/vets', { token, body: { full_name: 'Петров Павел Петрович' } })
    expect(namesake.status).toBe(201)
    expect(((await namesake.json()) as Vet).specialization).toBeNull()
    const list = (await (await call('GET', '/clinic/vets', { token })).json()) as Vet[]
    expect(list.map((item) => item.id)).toEqual([4, 5, 6, 100, 101])
  })
})

describe('врачи: изменение', () => {
  it('меняются только присланные поля; пустое тело — 200 без изменений', async () => {
    const token = await clinic()
    const renamed = await call('PATCH', '/clinic/vets/4', { token, body: { full_name: ' Петров П.П. ' } })
    expect(renamed.status).toBe(200)
    expect(await renamed.json()).toMatchObject({ full_name: 'Петров П.П.', specialization: 'терапевт', on_vacation: false })
    const empty = await call('PATCH', '/clinic/vets/4', { token, body: {} })
    expect(empty.status).toBe(200)
    expect(vetInState(4)).toMatchObject({ full_name: 'Петров П.П.', specialization: 'терапевт' })
  })

  it('null убирает специализацию, а в ФИО и отпуске — 422; отпуск — только true/false', async () => {
    const token = await clinic()
    const cleared = await call('PATCH', '/clinic/vets/4', { token, body: { specialization: null } })
    expect(((await cleared.json()) as Vet).specialization).toBeNull()
    const nulls = await call('PATCH', '/clinic/vets/4', { token, body: { full_name: null, on_vacation: null } })
    expect(nulls.status).toBe(422)
    expect(await fieldsOf(nulls)).toEqual(['full_name', 'on_vacation'])
    for (const value of ['true', 1, 0]) {
      const response = await call('PATCH', '/clinic/vets/4', { token, body: { on_vacation: value } })
      expect(response.status).toBe(422)
    }
    expect(vetInState(4)?.on_vacation).toBe(false)
  })

  it('отпуск ставится и снимается флагом', async () => {
    const token = await clinic()
    const on = await call('PATCH', '/clinic/vets/4', { token, body: { on_vacation: true } })
    expect(((await on.json()) as Vet).on_vacation).toBe(true)
    const off = await call('PATCH', '/clinic/vets/5', { token, body: { on_vacation: false } })
    expect(((await off.json()) as Vet).on_vacation).toBe(false)
  })

  it('архивного врача можно изменить', async () => {
    const response = await call('PATCH', '/clinic/vets/7', { token: await clinic(), body: { full_name: 'Орлов Д.С.' } })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ full_name: 'Орлов Д.С.', archived_at: '2026-09-15T12:00:00+03:00' })
  })
})

describe('врачи: архив', () => {
  it('архивирование не снимает отпуск; повторное — 200 без изменений; возврат — тоже', async () => {
    const token = await clinic()
    const first = (await (await call('POST', '/clinic/vets/5/archive', { token })).json()) as Vet
    expect(first.archived_at).not.toBeNull()
    expect(first.on_vacation).toBe(true)
    const again = await call('POST', '/clinic/vets/5/archive', { token })
    expect(again.status).toBe(200)
    expect(((await again.json()) as Vet).archived_at).toBe(first.archived_at)
    expect(((await (await call('GET', '/clinic/vets', { token })).json()) as Vet[]).map((vet) => vet.id)).toEqual([4, 6])

    const restored = (await (await call('POST', '/clinic/vets/5/restore', { token })).json()) as Vet
    expect(restored).toMatchObject({ archived_at: null, on_vacation: true })
    const restoredAgain = await call('POST', '/clinic/vets/5/restore', { token })
    expect(restoredAgain.status).toBe(200)
    expect(((await restoredAgain.json()) as Vet).archived_at).toBeNull()
  })
})

describe('врачи другой клиники', () => {
  it('изменение, архив и возврат — 404, как у несуществующего; врач не меняется', async () => {
    const token = await clinic()
    const before = vetInState(8)
    for (const [method, path, body] of [
      ['PATCH', '/clinic/vets/8', { on_vacation: true }],
      ['POST', '/clinic/vets/8/archive', undefined],
      ['POST', '/clinic/vets/8/restore', undefined],
      ['PATCH', '/clinic/vets/999', { on_vacation: true }],
    ] as const) {
      const response = await call(method, path, { token, body })
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ detail: 'Врач не найден' })
    }
    expect(vetInState(8)).toEqual(before)
  })

  it('сначала тело (422), потом поиск врача (404)', async () => {
    const response = await call('PATCH', '/clinic/vets/8', { token: await clinic(), body: { full_name: '' } })
    expect(response.status).toBe(422)
  })
})
