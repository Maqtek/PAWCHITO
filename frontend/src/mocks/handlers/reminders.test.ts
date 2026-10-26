import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiBaseUrl } from '../../api/base-url'
import type { Reminder, ReminderMarked } from '../../api/schema'
import { readServer, SEED_PASSWORD } from '../server-state'
import { resetMockServer } from '../session'

function call(method: string, path: string, { body, token }: { body?: unknown; token?: string } = {}) {
  return fetch(`${apiBaseUrl()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function accessToken(email = 'owner@example.com'): Promise<string> {
  const response = await call('POST', '/auth/login', { body: { email, password: SEED_PASSWORD } })
  return ((await response.json()) as { access_token: string }).access_token
}

async function list(token: string, query: string): Promise<Reminder[]> {
  const response = await call('GET', `/reminders?${query}`, { token })
  expect(response.status).toBe(200)
  return (await response.json()) as Reminder[]
}

async function locs(response: Response): Promise<string[]> {
  return ((await response.json()) as { detail: { loc: (string | number)[] }[] }).detail.map((item) => item.loc.join('.')).sort()
}

const NEW_REMINDER = { pet_id: 10, title: '  Погулять в парке  ', due_at: '2026-10-28T19:00:00+03:00' }

// Среда, 28 октября 2026, 09:00 по Москве. Курс Майло (рецепт №1, Мелоксикам в 20:00) — с 12.10 по 01.11: до 26.10
// выполнен, 22.10 пропущен, 27.10 просрочен. Свои дела: зубы 22.10 (выполнено) и 29.10 в 21:00 — серия №30, корм
// сегодня в 18:00, у Барсика капли 31.10.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-28T06:00:00Z'))
  resetMockServer()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('список дел', () => {
  it('по плановому времени; фильтры складываются; просроченное помечено', async () => {
    const token = await accessToken()
    const pending = await list(token, 'pet_id=10&status=pending&date_from=2026-10-27&date_to=2026-10-29')
    expect(pending.map((item) => [item.id, item.due_at, item.is_overdue])).toEqual([
      [16, '2026-10-27T20:00:00+03:00', true],
      [32, '2026-10-28T18:00:00+03:00', false],
      [17, '2026-10-28T20:00:00+03:00', false],
      [18, '2026-10-29T20:00:00+03:00', false],
      [31, '2026-10-29T21:00:00+03:00', false],
    ])
    expect(pending[0]).toMatchObject({ source: 'prescription', prescription_id: 1, title: 'Мелоксикам, 1,5 мл', category: 'treatment' })
    const course = await list(token, 'prescription_id=1')
    expect(course).toHaveLength(21)
    // Без pet_id — дела всех питомцев владельца.
    expect((await list(token, 'status=pending')).some((item) => item.pet_id === 11)).toBe(true)
  })

  it('чужой питомец или рецепт, неверный статус, «по» раньше «с» — 422', async () => {
    const token = await accessToken()
    expect(await locs(await call('GET', '/reminders?pet_id=13', { token }))).toEqual(['query.pet_id'])
    expect(await locs(await call('GET', '/reminders?prescription_id=999', { token }))).toEqual(['query.prescription_id'])
    expect(await locs(await call('GET', '/reminders?status=overdue', { token }))).toEqual(['query.status'])
    expect(await locs(await call('GET', '/reminders?date_from=2026-10-29&date_to=2026-10-28', { token }))).toEqual(['query.date_to'])
    expect((await call('GET', '/reminders', { token: await accessToken('clinic@example.com') })).status).toBe(403)
  })
})

describe('своё дело', () => {
  it('создаётся с типом «Уход» по умолчанию; с повтором — начало серии', async () => {
    const token = await accessToken()
    const once = await call('POST', '/reminders', { token, body: NEW_REMINDER })
    expect(once.status).toBe(201)
    expect(await once.json()).toMatchObject({
      id: 100,
      title: 'Погулять в парке',
      source: 'custom',
      category: 'routine',
      status: 'pending',
      repeat_interval_days: null,
      series_id: null,
    })
    const weekly = await call('POST', '/reminders', {
      token,
      body: { ...NEW_REMINDER, category: 'prevention', repeat_interval_days: 7, due_at: '2026-10-28T06:30:00Z' },
    })
    expect(await weekly.json()).toMatchObject({ id: 101, due_at: '2026-10-28T09:30:00+03:00', category: 'prevention', series_id: 101 })
  })

  it('прошедшее время, секунды, дальше года, архивный питомец, пустое название, неверный повтор — 422', async () => {
    const token = await accessToken()
    const response = await call('POST', '/reminders', {
      token,
      body: { pet_id: 12, title: '   ', due_at: '2026-10-28T08:59:00+03:00', category: 'other', repeat_interval_days: 0 },
    })
    expect(await locs(response)).toEqual([
      'body.category',
      'body.due_at',
      'body.pet_id',
      'body.repeat_interval_days',
      'body.title',
    ])
    for (const due_at of ['2026-10-28T19:00:30+03:00', '2027-10-29T09:00:00+03:00', '28.10.2026 19:00']) {
      expect(await locs(await call('POST', '/reminders', { token, body: { ...NEW_REMINDER, due_at } }))).toEqual(['body.due_at'])
    }
    // Текущая минута — ещё можно; ровно год вперёд — тоже.
    expect((await call('POST', '/reminders', { token, body: { ...NEW_REMINDER, due_at: '2026-10-28T09:00:00+03:00' } })).status).toBe(201)
    expect((await call('POST', '/reminders', { token, body: { ...NEW_REMINDER, due_at: '2027-10-28T23:30:00+03:00' } })).status).toBe(201)
    expect(await locs(await call('POST', '/reminders', { token, body: { ...NEW_REMINDER, repeat_interval_days: 1.5 } }))).toEqual([
      'body.repeat_interval_days',
    ])
  })
})

describe('отметка', () => {
  it('просроченное и сегодняшнее — можно, завтрашнее — 409; повторно — 409; у дела курса next нет', async () => {
    const token = await accessToken()
    const done = await call('POST', '/reminders/16/done', { token })
    expect(done.status).toBe(200)
    expect(await done.json()).toMatchObject({
      reminder: { id: 16, status: 'done', is_overdue: false, done_at: '2026-10-28T09:00:00+03:00' },
      next: null,
    })
    const again = await call('POST', '/reminders/16/skip', { token })
    expect(again.status).toBe(409)
    expect(await again.json()).toEqual({ detail: 'Дело уже отмечено' })
    const tomorrow = await call('POST', '/reminders/18/done', { token })
    expect(await tomorrow.json()).toEqual({ detail: 'Дело ещё не наступило' })
    const skipped = (await (await call('POST', '/reminders/32/skip', { token })).json()) as ReminderMarked
    expect(skipped).toMatchObject({ reminder: { status: 'skipped', done_at: '2026-10-28T09:00:00+03:00' }, next: null })
    expect((await call('POST', '/reminders/999/done', { token })).status).toBe(404)
  })

  it('серия: следующее — от плановой даты, а не от отметки; пропуск не обрывает серию', async () => {
    const token = await accessToken()
    // Четверг, 29.10, 23:00 — зубы на 21:00 уже просрочены.
    vi.setSystemTime(new Date('2026-10-29T20:00:00Z'))
    const done = (await (await call('POST', '/reminders/31/done', { token })).json()) as ReminderMarked
    expect(done.next).toMatchObject({ id: 100, due_at: '2026-11-05T21:00:00+03:00', status: 'pending', series_id: 30, title: 'Почистить зубы' })
    vi.setSystemTime(new Date('2026-11-05T05:00:00Z'))
    const skipped = (await (await call('POST', '/reminders/100/skip', { token })).json()) as ReminderMarked
    expect(skipped.next).toMatchObject({ id: 101, due_at: '2026-11-12T21:00:00+03:00', series_id: 30 })
  })

  it('следующее дело серии может сразу оказаться просроченным', async () => {
    const token = await accessToken()
    await call('POST', '/reminders', { token, body: { ...NEW_REMINDER, due_at: '2026-10-28T09:00:00+03:00', repeat_interval_days: 1 } })
    vi.setSystemTime(new Date('2026-10-31T06:00:00Z'))
    const marked = (await (await call('POST', '/reminders/100/done', { token })).json()) as ReminderMarked
    expect(marked.next).toMatchObject({ due_at: '2026-10-29T09:00:00+03:00', is_overdue: true })
  })
})

describe('удаление', () => {
  it('своё запланированное — 204 и серия закончена; дело курса — 403; отмеченное — 409; повторно — 404', async () => {
    const token = await accessToken()
    expect((await call('DELETE', '/reminders/31', { token })).status).toBe(204)
    expect((await list(token, 'pet_id=10')).some((item) => item.series_id === 30 && item.status === 'pending')).toBe(false)
    expect((await call('DELETE', '/reminders/31', { token })).status).toBe(404)
    const course = await call('DELETE', '/reminders/17', { token })
    expect(course.status).toBe(403)
    expect(await course.json()).toEqual({ detail: 'Дела курса не удаляются' })
    const marked = await call('DELETE', '/reminders/30', { token })
    expect(await marked.json()).toEqual({ detail: 'Отмеченное дело не удаляется' })
  })
})

describe('курс', () => {
  it('прогресс: просроченное — в pending; после отметки пересчитан; чужой рецепт — 404', async () => {
    const token = await accessToken()
    const progress = async () => (await call('GET', '/prescriptions/1/progress', { token })).json()
    expect(await progress()).toEqual({ prescription_id: 1, total: 21, done: 14, skipped: 1, pending: 6 })
    await call('POST', '/reminders/16/done', { token })
    expect(await progress()).toEqual({ prescription_id: 1, total: 21, done: 15, skipped: 1, pending: 5 })
    expect((await call('GET', '/prescriptions/999/progress', { token })).status).toBe(404)
  })

  it('итог приёма создаёт дела курса: «препарат, дозировка», «Лечение», без прошедших доз', async () => {
    vi.setSystemTime(new Date('2026-10-30T07:30:00Z'))
    const clinic = await accessToken('clinic@example.com')
    await call('POST', '/clinic/appointments/20/outcome', {
      token: clinic,
      body: {
        conclusion: 'Отит',
        care_status: 'treatment',
        prescriptions: [{ drug: 'Амоксициллин', dosage: '250 мг', times: ['09:00', '21:00'], duration_days: 2 }],
      },
    })
    const course = await list(await accessToken(), 'prescription_id=100')
    expect(course.map((item) => item.due_at)).toEqual([
      '2026-10-30T21:00:00+03:00',
      '2026-10-31T09:00:00+03:00',
      '2026-10-31T21:00:00+03:00',
    ])
    expect(course[0]).toMatchObject({ title: 'Амоксициллин, 250 мг', category: 'treatment', source: 'prescription', series_id: null })
  })

  it('архив питомца удаляет его запланированные дела — и свои, и курса; отмеченные остаются', async () => {
    const token = await accessToken()
    const archived = await call('POST', '/pets/10/archive', { token })
    expect(await archived.json()).toMatchObject({ deleted_reminders: 8 })
    expect(await (await call('GET', '/prescriptions/1/progress', { token })).json()).toMatchObject({ total: 15, pending: 0 })
    expect(readServer().reminders.filter((item) => item.pet_id === 10).every((item) => item.status !== 'pending')).toBe(true)
  })
})
