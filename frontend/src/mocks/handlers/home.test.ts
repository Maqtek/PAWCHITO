import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiBaseUrl } from '../../api/base-url'
import type { HomeSummary } from '../../api/schema'
import { SEED_PASSWORD } from '../server-state'
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

async function summary(token: string, petId: number): Promise<HomeSummary> {
  const response = await call('GET', `/home/summary?pet_id=${petId}`, { token })
  expect(response.status).toBe(200)
  return (await response.json()) as HomeSummary
}

async function locs(response: Response): Promise<string[]> {
  return ((await response.json()) as { detail: { loc: (string | number)[] }[] }).detail.map((item) => item.loc.join('.'))
}

const todayIds = (data: HomeSummary) => data.today.map((item) => item.id)

// Среда, 28 октября 2026, 09:00 по Москве. Курс Майло (рецепт №1, Мелоксикам в 20:00) — с 12.10 по 01.11: до 26.10
// выполнен, 22.10 пропущен, доза 27.10 (№16) просрочена, сегодняшняя — №17. Свои дела: корм сегодня в 18:00 (№32),
// зубы завтра в 21:00 (№31). Записи Майло: подтверждённая №20 в пятницу, 30.10, в 10:00 и заявка №21 2 ноября;
// у Барсика — заявка №24 на завтра в 09:00.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-28T06:00:00Z'))
  resetMockServer()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('сводка главной', () => {
  it('питомец, активный курс с прогрессом, дела на сегодня с просроченными, ближайшая запись', async () => {
    const data = await summary(await accessToken(), 10)
    expect(data.pet).toMatchObject({ id: 10, name: 'Майло', care_status: 'treatment' })
    expect(data.active_courses).toEqual([
      { prescription_id: 1, drug: 'Мелоксикам', dosage: '1,5 мл', total: 21, done: 14, skipped: 1 },
    ])
    expect(data.today.map((item) => [item.id, item.due_at, item.is_overdue])).toEqual([
      [16, '2026-10-27T20:00:00+03:00', true],
      [32, '2026-10-28T18:00:00+03:00', false],
      [17, '2026-10-28T20:00:00+03:00', false],
    ])
    expect(data.today[1]).toMatchObject({ title: 'Купить корм', source: 'custom', status: 'pending' })
    expect(data.next_appointment).toMatchObject({
      id: 20,
      status: 'confirmed',
      slot_start: '2026-10-30T10:00:00+03:00',
      pet: { id: 10, name: 'Майло' },
      clinic: { name: 'ВетДоктор' },
      vet: { full_name: 'Петров Павел Петрович' },
    })
  })

  it('отмеченное дело уходит из «сегодня», прогресс курса пересчитан; поздно вечером просрочены все дела дня', async () => {
    const token = await accessToken()
    await call('POST', '/reminders/16/done', { token })
    await call('POST', '/reminders/32/skip', { token })
    const marked = await summary(token, 10)
    expect(todayIds(marked)).toEqual([17])
    expect(marked.active_courses[0]).toMatchObject({ total: 21, done: 15, skipped: 1 })

    // Четверг, 29.10, 23:00: вчерашняя и сегодняшние дозы и зубы в 21:00 просрочены; пятничная доза — нет.
    vi.setSystemTime(new Date('2026-10-29T20:00:00Z'))
    const late = await summary(token, 10)
    expect(late.today.map((item) => [item.id, item.is_overdue])).toEqual([
      [17, true],
      [18, true],
      [31, true],
    ])
  })

  it('ближайшая запись — «Заявка» или «Подтверждена», время которой не наступило, иначе null', async () => {
    const token = await accessToken()
    // Пятница, 30.10, 10:00: приём №20 начался — ближайшей становится заявка №21.
    vi.setSystemTime(new Date('2026-10-30T07:00:00Z'))
    expect((await summary(token, 10)).next_appointment).toMatchObject({ id: 21, status: 'requested' })

    vi.setSystemTime(new Date('2026-10-28T06:00:00Z'))
    expect((await summary(token, 11)).next_appointment).toMatchObject({ id: 24, pet: { name: 'Барсик' } })
    expect((await call('POST', '/appointments/24/cancel', { token })).status).toBe(200)
    expect((await summary(token, 11)).next_appointment).toBeNull()
  })

  it('у питомца без курсов и дел на сегодня — пустые списки', async () => {
    const data = await summary(await accessToken(), 11)
    expect(data.pet.name).toBe('Барсик')
    expect(data.active_courses).toEqual([])
    // Капли от блох — через 3 дня: в «сегодня» не попадают.
    expect(data.today).toEqual([])
  })

  it('курс активен до конца последнего дня; новые курсы — сверху по дате начала', async () => {
    const owner = await accessToken()
    // Воскресенье, 1.11, 23:30 — последний день курса ещё идёт.
    vi.setSystemTime(new Date('2026-11-01T20:30:00Z'))
    expect((await summary(owner, 10)).active_courses).toHaveLength(1)
    vi.setSystemTime(new Date('2026-11-02T06:00:00Z'))
    expect((await summary(owner, 10)).active_courses).toEqual([])

    // Пятница, 30.10, 10:30 — итог приёма №20 с двумя рецептами: один с сегодняшнего дня, другой — с 5 ноября.
    vi.setSystemTime(new Date('2026-10-30T07:30:00Z'))
    const outcome = await call('POST', '/clinic/appointments/20/outcome', {
      token: await accessToken('clinic@example.com'),
      body: {
        conclusion: 'Отит',
        care_status: 'treatment',
        prescriptions: [
          { drug: 'Амоксициллин', dosage: '250 мг', times: ['09:00', '21:00'], duration_days: 2 },
          { drug: 'Отипакс', dosage: '2 капли', times: ['10:00'], duration_days: 3, start_date: '2026-11-05' },
        ],
      },
    })
    expect(outcome.status).toBe(200)
    expect((await summary(await accessToken(), 10)).active_courses).toEqual([
      { prescription_id: 101, drug: 'Отипакс', dosage: '2 капли', total: 3, done: 0, skipped: 0 },
      // Утренняя доза уже прошла — дел курса три, а не четыре (Р-56).
      { prescription_id: 100, drug: 'Амоксициллин', dosage: '250 мг', total: 3, done: 0, skipped: 0 },
      { prescription_id: 1, drug: 'Мелоксикам', dosage: '1,5 мл', total: 21, done: 14, skipped: 1 },
    ])
  })

  it('архивный питомец — как обычно: запланированные дела удалены, записи отменены', async () => {
    const token = await accessToken()
    expect((await call('POST', '/pets/10/archive', { token })).status).toBe(200)
    const data = await summary(token, 10)
    expect(data.pet.archived_at).not.toBeNull()
    expect(data.today).toEqual([])
    expect(data.next_appointment).toBeNull()
    expect(data.active_courses).toEqual([
      { prescription_id: 1, drug: 'Мелоксикам', dosage: '1,5 мл', total: 15, done: 14, skipped: 1 },
    ])
    expect((await summary(token, 12)).pet.name).toBe('Кеша')
  })

  it('нет pet_id или не число — 422; чужой и несуществующий питомец — 404; не владелец — 403', async () => {
    const token = await accessToken()
    for (const query of ['', '?pet_id=', '?pet_id=abc', '?pet_id=1.5']) {
      const response = await call('GET', `/home/summary${query}`, { token })
      expect(response.status).toBe(422)
      expect(await locs(response)).toEqual(['query.pet_id'])
    }
    for (const petId of [13, 999]) {
      const response = await call('GET', `/home/summary?pet_id=${petId}`, { token })
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ detail: 'Питомец не найден' })
    }
    expect((await call('GET', '/home/summary?pet_id=10', { token: await accessToken('clinic@example.com') })).status).toBe(403)
    expect((await call('GET', '/home/summary?pet_id=10')).status).toBe(401)
  })
})
