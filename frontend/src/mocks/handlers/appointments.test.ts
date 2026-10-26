import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiBaseUrl } from '../../api/base-url'
import type { Appointment, Clinic, Slot, Vet } from '../../api/schema'
import { readServer, SEED_PASSWORD } from '../server-state'
import { resetMockServer } from '../session'

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
  return ((await response.json()) as { detail: { loc: string[] }[] }).detail.map((item) => item.loc.join('.')).sort()
}

const book = (token: string, body: Record<string, unknown>) =>
  call('POST', '/appointments', {
    token,
    body: { pet_id: 10, vet_id: 4, reason: 'checkup', slot_start: '2026-10-30T11:00:00+03:00', ...body },
  })

// Среда, 28 октября 2026, 09:00 по Москве. Seed записей считается от «сегодня»:
// №20 и №25 — пятница 30.10 в 10:00 и 10:30 у Петрова, №21 — понедельник 02.11, №22 — 12.10 (итог), №23 — 23.10 (отмена).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-28T06:00:00Z'))
  resetMockServer()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('запись: клиники и врачи', () => {
  it('только владелец; активные клиники по названию, без полей админки', async () => {
    expect((await call('GET', '/clinics')).status).toBe(401)
    expect((await call('GET', '/clinics', { token: await accessToken('clinic@example.com') })).status).toBe(403)
    const clinics = (await (await call('GET', '/clinics', { token: await owner() })).json()) as Clinic[]
    expect(clinics.map((clinic) => clinic.name)).toEqual(['ВетДоктор', 'Зоовет', 'Клиника «Новая»'])
    expect(Object.keys(clinics[0]).sort()).toEqual(['address', 'closes_at', 'id', 'name', 'opens_at', 'phone', 'work_days'])
  })

  it('врачи клиники без отпуска и архива, по ФИО; скрытая клиника — 404', async () => {
    const token = await owner()
    const vets = (await (await call('GET', '/clinics/2/vets', { token })).json()) as Vet[]
    expect(vets.map((vet) => vet.full_name)).toEqual(['Ким Елена Викторовна', 'Петров Павел Петрович'])
    expect((await call('GET', '/clinics/5/vets', { token })).status).toBe(404)
  })
})

describe('запись: свободные слоты', () => {
  it('сетка по 30 минут до закрытия, без занятых записями «Заявка» и «Подтверждена»', async () => {
    const slots = (await (await call('GET', '/clinics/2/vets/4/slots?date=2026-10-30', { token: await owner() })).json()) as Slot[]
    const times = slots.map((slot) => slot.slot_start.slice(11, 16))
    expect(times[0]).toBe('09:00')
    expect(times.at(-1)).toBe('19:30')
    expect(times).not.toContain('10:00')
    expect(times).not.toContain('10:30')
    expect(slots[0]).toEqual({ slot_start: '2026-10-30T09:00:00+03:00', slot_end: '2026-10-30T09:30:00+03:00' })
  })

  it('сегодня — только ещё не начавшиеся; воскресенье — пусто; окно — 30 дней', async () => {
    const token = await owner()
    const today = (await (await call('GET', '/clinics/2/vets/4/slots?date=2026-10-28', { token })).json()) as Slot[]
    expect(today[0].slot_start).toBe('2026-10-28T09:30:00+03:00')
    expect(await (await call('GET', '/clinics/2/vets/4/slots?date=2026-11-01', { token })).json()).toEqual([])
    expect((await call('GET', '/clinics/2/vets/4/slots?date=2026-11-27', { token })).status).toBe(200)
    for (const date of ['2026-11-28', '2026-10-27', '28.10.2026']) {
      const response = await call('GET', `/clinics/2/vets/4/slots?date=${date}`, { token })
      expect(await fieldsOf(response)).toEqual(['query.date'])
    }
  })

  it('врач в отпуске, в архиве или из другой клиники — 404', async () => {
    const token = await owner()
    for (const path of ['/clinics/2/vets/5', '/clinics/2/vets/7', '/clinics/2/vets/8', '/clinics/5/vets/4']) {
      expect((await call('GET', `${path}/slots?date=2026-10-30`, { token })).status).toBe(404)
    }
  })
})

describe('запись: создание', () => {
  it('201: заявка, клиника по врачу, клички и имена; время со смещением Москвы', async () => {
    const token = await owner()
    const response = await book(token, { slot_start: '2026-10-30T08:00:00Z', reason_comment: '  ' })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      pet: { id: 10, name: 'Майло' },
      clinic: { id: 2, name: 'ВетДоктор' },
      vet: { id: 4, full_name: 'Петров Павел Петрович' },
      slot_start: '2026-10-30T11:00:00+03:00',
      slot_end: '2026-10-30T11:30:00+03:00',
      reason: 'checkup',
      reason_comment: null,
      status: 'requested',
      cancelled_by: null,
      outcome: null,
    })
  })

  it('409: слот уже занят — своей записью или чужой', async () => {
    const token = await owner()
    expect((await book(token, {})).status).toBe(201)
    const again = await book(token, { pet_id: 11 })
    expect(again.status).toBe(409)
    expect(await again.json()).toEqual({ detail: 'Слот уже занят' })
    expect((await book(token, { slot_start: '2026-10-30T10:30:00+03:00' })).status).toBe(409)
  })

  it('время вне сетки, в воскресенье, уже прошло или дальше 30 дней — 422 у slot_start', async () => {
    const token = await owner()
    for (const slot_start of [
      '2026-10-30T11:15:00+03:00',
      '2026-10-30T20:00:00+03:00',
      '2026-11-01T11:00:00+03:00',
      '2026-10-28T09:00:00+03:00',
      '2026-11-28T11:00:00+03:00',
      '30.10.2026 11:00',
    ]) {
      expect(await fieldsOf(await book(token, { slot_start }))).toEqual(['body.slot_start'])
    }
  })

  it('чужой или архивный питомец, недоступный врач, причина и комментарий — 422 у полей', async () => {
    const token = await owner()
    expect(await fieldsOf(await book(token, { pet_id: 13 }))).toEqual(['body.pet_id'])
    expect(await fieldsOf(await book(token, { pet_id: 12 }))).toEqual(['body.pet_id'])
    expect(await fieldsOf(await book(token, { vet_id: 5 }))).toEqual(['body.vet_id'])
    const invalid = await book(token, { reason: 'grooming', reason_comment: 'х'.repeat(501) })
    expect(await fieldsOf(invalid)).toEqual(['body.reason', 'body.reason_comment'])
  })
})

describe('запись: отмена владельцем', () => {
  it('до начала приёма — отменена владельцем; повтор и завершённая — 409; чужая — 404', async () => {
    const token = await owner()
    const cancelled = await call('POST', '/appointments/20/cancel', { token })
    expect(await cancelled.json()).toMatchObject({ status: 'cancelled', cancelled_by: 'owner' })
    // Слот освободился.
    const slots = (await (await call('GET', '/clinics/2/vets/4/slots?date=2026-10-30', { token })).json()) as Slot[]
    expect(slots.map((slot) => slot.slot_start.slice(11, 16))).toContain('10:00')
    const again = await call('POST', '/appointments/20/cancel', { token })
    expect(again.status).toBe(409)
    expect(await again.json()).toEqual({ detail: 'Запись уже завершена или отменена' })
    expect((await call('POST', '/appointments/22/cancel', { token })).status).toBe(409)
    expect((await call('POST', '/appointments/25/cancel', { token })).status).toBe(404)
  })

  it('приём уже начался — 409', async () => {
    const token = await owner()
    vi.setSystemTime(new Date('2026-10-30T07:00:00Z'))
    const started = await call('POST', '/appointments/20/cancel', { token })
    expect(started.status).toBe(409)
    expect(await started.json()).toEqual({ detail: 'Приём уже начался' })
  })
})

describe('мои записи', () => {
  it('записи питомца от поздних к ранним; фильтр по статусу; чужие — 404', async () => {
    const token = await owner()
    const all = (await (await call('GET', '/pets/10/appointments', { token })).json()) as Appointment[]
    expect(all.map((item) => item.id)).toEqual([21, 20, 23, 22])
    const completed = (await (await call('GET', '/pets/10/appointments?status=completed', { token })).json()) as Appointment[]
    expect(completed.map((item) => [item.id, item.outcome?.conclusion])).toEqual([[22, 'Растяжение связок задней лапы']])
    expect(await fieldsOf(await call('GET', '/pets/10/appointments?status=done', { token }))).toEqual(['query.status'])
    expect((await call('GET', '/pets/13/appointments', { token })).status).toBe(404)
    expect((await call('GET', '/appointments/25', { token })).status).toBe(404)
    expect(await (await call('GET', '/appointments/23', { token })).json()).toMatchObject({
      cancelled_by: 'clinic',
      clinic_comment: 'Врач заболела, перезапишитесь, пожалуйста',
    })
  })

  it('архив питомца отменяет его будущие записи системой (Р-51); записи по-прежнему видны', async () => {
    const token = await owner()
    const archived = await call('POST', '/pets/10/archive', { token })
    expect(await archived.json()).toMatchObject({ cancelled_appointments: 2 })
    const all = (await (await call('GET', '/pets/10/appointments', { token })).json()) as Appointment[]
    expect(all.filter((item) => item.cancelled_by === 'system').map((item) => item.id).sort()).toEqual([20, 21])
  })

  it('скрытие клиники отменяет будущие записи к её врачам системой', async () => {
    await call('POST', '/admin/clinics/2/archive', { token: await accessToken('admin@example.com') })
    expect(readServer().appointments.filter((item) => item.cancelled_by === 'system').map((item) => item.id).sort()).toEqual([
      20, 21, 24, 25,
    ])
  })
})
