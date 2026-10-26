import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiBaseUrl } from '../../api/base-url'
import type { TimelineItem } from '../../api/schema'
import { newObservation, SEED_PASSWORD, updateServer } from '../server-state'
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

async function timeline(token: string, path: string): Promise<TimelineItem[]> {
  const response = await call('GET', path, { token })
  expect(response.status).toBe(200)
  return (await response.json()) as TimelineItem[]
}

/** Элементы ленты коротко: тип, дата и id данных. */
const brief = (items: TimelineItem[]) => items.map((item) => [item.type, item.date, item.data.id])

async function locs(response: Response): Promise<string[]> {
  expect(response.status).toBe(422)
  return ((await response.json()) as { detail: { loc: (string | number)[] }[] }).detail.map((item) => item.loc.join('.')).sort()
}

/** Лента Майло по seed на 28.10.2026: отменённой записи №23 (23.10) и предстоящих №20 и №21 в ней нет. */
const MILO_SEED = [
  ['observation', '2026-10-24', 3],
  ['observation', '2026-10-20', 2],
  ['appointment', '2026-10-12', 22],
  ['prescription', '2026-10-12', 1],
  ['vaccination', '2026-10-10', 2],
  ['observation', '2026-10-10', 1],
  ['vaccination', '2026-01-15', 1],
]

// Среда, 28 октября 2026, 09:00 по Москве. Seed записей считается от «сегодня»: №22 — завершённый приём 12.10 с курсом
// Мелоксикама с того же дня, №23 — отменённая клиникой 23.10, №20 и №21 — впереди.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-28T06:00:00Z'))
  resetMockServer()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('лента истории', () => {
  it('наблюдения, прививки, приёмы с итогом и курсы — от новых дат к старым, по типу в один день', async () => {
    const token = await accessToken()
    const items = await timeline(token, '/pets/10/timeline')
    expect(brief(items)).toEqual(MILO_SEED)

    const appointment = items.find((item) => item.type === 'appointment')
    expect(appointment?.data).toMatchObject({
      id: 22,
      status: 'completed',
      clinic: { id: 2, name: 'ВетДоктор' },
      vet: { id: 4, full_name: 'Петров Павел Петрович' },
      outcome: { conclusion: 'Растяжение связок задней лапы' },
    })
    expect(items.find((item) => item.type === 'prescription')?.data).toEqual({
      id: 1,
      drug: 'Мелоксикам',
      dosage: '1,5 мл',
      times: ['20:00'],
      duration_days: 21,
      start_date: '2026-10-12',
    })
    expect(items.find((item) => item.type === 'observation' && item.data.id === 1)?.data).toMatchObject({
      weight: 31.5,
      source: 'clinic',
    })

    // У Барсика — только его записи; заявка на завтра в ленту не входит.
    expect(brief(await timeline(token, '/pets/11/timeline'))).toEqual([
      ['observation', '2026-10-22', 4],
      ['vaccination', '2025-06-01', 3],
    ])
  })

  it('в один день — приём, курс, прививка, наблюдение; внутри типа — от больших id; день приёма — по Москве', async () => {
    updateServer((state) => {
      const milo = state.appointments.find((item) => item.id === 22)
      if (!milo?.outcome) throw new Error('В seed нет приёма №22 с итогом')
      milo.outcome.prescriptions.push({ id: 2, drug: 'Омепразол', dosage: '10 мг', times: ['08:00'], duration_days: 7, start_date: '2026-10-12' })
      state.observations.push(newObservation({ id: 100, pet_id: 10, date: '2026-10-12', note: 'После приёма', source: 'owner' }))
      state.vaccinations.push({ id: 100, pet_id: 10, name: 'Нобивак Lepto', date: '2026-10-12', next_date: null, source: 'owner', appointment_id: null })
      const visit = { ...milo, outcome: { ...milo.outcome, prescriptions: [] } }
      state.appointments.push(
        // 00:30 по Москве — это ещё 4 октября по UTC, но в ленте приём стоит 5 октября.
        { ...visit, id: 26, slot_start: '2026-10-04T21:30:00Z' },
        // Завершённый приём чужого питомца в ленту Майло не попадает.
        { ...visit, id: 27, pet_id: 13 },
      )
    })
    const items = await timeline(await accessToken(), '/pets/10/timeline')
    expect(brief(items).slice(2, 7)).toEqual([
      ['appointment', '2026-10-12', 22],
      ['prescription', '2026-10-12', 2],
      ['prescription', '2026-10-12', 1],
      ['vaccination', '2026-10-12', 100],
      ['observation', '2026-10-12', 100],
    ])
    expect(brief(items).filter(([type]) => type === 'appointment')).toEqual([
      ['appointment', '2026-10-12', 22],
      ['appointment', '2026-10-05', 26],
    ])
    expect(items.some((item) => item.type === 'appointment' && item.data.id === 27)).toBe(false)
  })

  it('before — строго раньше даты; limit не разрывает день', async () => {
    const token = await accessToken()
    expect(brief(await timeline(token, '/pets/10/timeline?before=2026-10-12'))).toEqual(MILO_SEED.slice(4))
    expect(brief(await timeline(token, '/pets/10/timeline?before=2026-10-13'))).toEqual(MILO_SEED.slice(2))
    expect(await timeline(token, '/pets/10/timeline?before=2026-01-15')).toEqual([])

    expect(brief(await timeline(token, '/pets/10/timeline?limit=1'))).toEqual(MILO_SEED.slice(0, 1))
    // Лимит пришёлся на первый элемент 12.10 — приходит весь день.
    expect(brief(await timeline(token, '/pets/10/timeline?limit=3'))).toEqual(MILO_SEED.slice(0, 4))
    expect(brief(await timeline(token, '/pets/10/timeline?limit=4'))).toEqual(MILO_SEED.slice(0, 4))
    expect(brief(await timeline(token, '/pets/10/timeline?before=2026-10-13&limit=1'))).toEqual(MILO_SEED.slice(2, 4))
    expect(brief(await timeline(token, '/pets/10/timeline?limit=100'))).toEqual(MILO_SEED)
  })

  it('по умолчанию — 50 элементов; листание страницами по before ничего не теряет и не повторяет', async () => {
    updateServer((state) => {
      // 60 наблюдений: по три в день с 1 по 20 сентября.
      for (let index = 0; index < 60; index += 1) {
        const day = String(20 - Math.floor(index / 3)).padStart(2, '0')
        state.observations.push(newObservation({ id: 200 + index, pet_id: 10, date: `2026-09-${day}`, note: `Запись ${index}`, source: 'owner' }))
      }
    })
    const token = await accessToken()
    const all = await timeline(token, '/pets/10/timeline?limit=100')
    expect(all).toHaveLength(67)
    // 50-й элемент — второй из трёх за 6 сентября: страница добирает день.
    const first = await timeline(token, '/pets/10/timeline')
    expect(first).toHaveLength(51)
    expect(first.at(-1)?.date).toBe('2026-09-06')

    for (const limit of [1, 2, 4, 7]) {
      const walked: TimelineItem[] = []
      let before: string | null = null
      for (let pages = 0; pages < 100; pages += 1) {
        const items = await timeline(token, `/pets/10/timeline?limit=${limit}${before ? `&before=${before}` : ''}`)
        if (items.length === 0) break
        expect(items.length).toBeGreaterThanOrEqual(Math.min(limit, all.length - walked.length))
        walked.push(...items)
        before = items[items.length - 1].date
      }
      expect(brief(walked)).toEqual(brief(all))
    }
  })

  it('неверные before и limit — 422 в loc query', async () => {
    const token = await accessToken()
    for (const query of ['before=10.10.2026', 'before=2026-02-30', 'before=', 'before=2026-10-1']) {
      expect(await locs(await call('GET', `/pets/10/timeline?${query}`, { token }))).toEqual(['query.before'])
    }
    for (const query of ['limit=0', 'limit=101', 'limit=abc', 'limit=1.5', 'limit=-1', 'limit=']) {
      expect(await locs(await call('GET', `/pets/10/timeline?${query}`, { token }))).toEqual(['query.limit'])
    }
    expect(await locs(await call('GET', '/pets/10/timeline?before=вчера&limit=500', { token }))).toEqual([
      'query.before',
      'query.limit',
    ])
    // Параметры проверяются раньше поиска питомца.
    expect(await locs(await call('GET', '/pets/13/timeline?limit=0', { token }))).toEqual(['query.limit'])
  })

  it('доступ: гость — 401, клиника — 403, чужой и несуществующий питомец — 404, архивный — как обычно', async () => {
    expect((await call('GET', '/pets/10/timeline')).status).toBe(401)
    expect((await call('GET', '/pets/10/timeline', { token: await accessToken('clinic@example.com') })).status).toBe(403)
    const token = await accessToken()
    for (const path of ['/pets/13/timeline', '/pets/999/timeline']) {
      const response = await call('GET', path, { token })
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ detail: 'Питомец не найден' })
    }
    updateServer((state) => {
      const milo = state.pets.find((pet) => pet.id === 10)
      if (milo) milo.archived_at = '2026-10-27T12:00:00+03:00'
    })
    expect(brief(await timeline(token, '/pets/10/timeline'))).toEqual(MILO_SEED)
  })
})
