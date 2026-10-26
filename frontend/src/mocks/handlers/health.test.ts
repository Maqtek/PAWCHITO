import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiBaseUrl } from '../../api/base-url'
import type { Condition, Observation, Vaccination } from '../../api/schema'
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
  return ((await response.json()) as { detail: { loc: string[] }[] }).detail.map((item) => item.loc.join('.')).sort()
}

afterEach(() => {
  vi.useRealTimers()
})

describe('здоровье: доступ и чужие данные', () => {
  it('гость — 401, клиника и администратор — 403', async () => {
    expect((await call('GET', '/pets/10/conditions')).status).toBe(401)
    expect((await call('GET', '/pets/10/observations', { token: await accessToken('clinic@example.com') })).status).toBe(403)
    expect((await call('GET', '/pets/10/vaccinations', { token: await accessToken('admin@example.com') })).status).toBe(403)
  })

  it('питомец другого владельца и запись другого питомца — 404; чужие записи не меняются', async () => {
    const token = await owner()
    for (const path of ['/pets/13/conditions', '/pets/13/observations', '/pets/13/vaccinations', '/pets/999/conditions']) {
      expect((await call('GET', path, { token })).status).toBe(404)
    }
    // Запись 4 — Рекса: через своего Майло её не достать.
    expect((await call('PATCH', '/pets/10/conditions/4', { token, body: { title: 'Моё' } })).status).toBe(404)
    expect((await call('DELETE', '/pets/10/vaccinations/4', { token })).status).toBe(404)
    expect(readServer().conditions.find((item) => item.id === 4)?.title).toBe('Артрит')
  })

  it('порядок проверок: тело (422), потом поиск (404), потом источник (403)', async () => {
    const token = await owner()
    expect((await call('PATCH', '/pets/13/conditions/4', { token, body: { title: '' } })).status).toBe(422)
    expect((await call('PATCH', '/pets/10/conditions/2', { token, body: { title: '' } })).status).toBe(422)
    const clinic = await call('PATCH', '/pets/10/conditions/2', { token, body: { title: 'Своё' } })
    expect(clinic.status).toBe(403)
    expect(await clinic.json()).toEqual({ detail: 'Запись внесена клиникой — изменить её может только клиника' })
  })
})

describe('особенности здоровья', () => {
  it('свои и от клиники, без архивных, в порядке добавления', async () => {
    const list = (await (await call('GET', '/pets/10/conditions', { token: await owner() })).json()) as Condition[]
    expect(list.map((item) => [item.title, item.source])).toEqual([
      ['Аллергия на курицу', 'owner'],
      ['Дисплазия тазобедренных суставов', 'clinic'],
    ])
  })

  it('добавление: 422 по всем полям сразу; переводы строк в комментарии разрешены, пустой — null', async () => {
    const token = await owner()
    const invalid = await call('POST', '/pets/10/conditions', {
      token,
      body: { kind: 'flu', title: 'х'.repeat(101), description: 'а\u0007б' },
    })
    expect(await fieldsOf(invalid)).toEqual(['body.description', 'body.kind', 'body.title'])
    const created = await call('POST', '/pets/10/conditions', {
      token,
      body: { kind: 'chronic', title: ' Гастрит ', description: '   ' },
    })
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({ pet_id: 10, kind: 'chronic', title: 'Гастрит', description: null, source: 'owner' })
    const multiline = await call('POST', '/pets/10/conditions', {
      token,
      body: { kind: 'allergy', title: 'Пыльца', description: 'Весной\nчихает' },
    })
    expect(await multiline.json()).toMatchObject({ description: 'Весной\nчихает' })
  })

  it('изменение: только присланные поля, null убирает комментарий, в названии — 422; {} — без изменений', async () => {
    const token = await owner()
    expect(await (await call('PATCH', '/pets/10/conditions/1', { token, body: {} })).json()).toMatchObject({
      title: 'Аллергия на курицу',
    })
    const cleared = await call('PATCH', '/pets/10/conditions/1', { token, body: { description: null } })
    expect(await cleared.json()).toMatchObject({ title: 'Аллергия на курицу', description: null })
    expect((await call('PATCH', '/pets/10/conditions/1', { token, body: { title: null } })).status).toBe(422)
  })

  it('архив: пропадает из списка; повтор — 200 без изменений; запись клиники — 403', async () => {
    const token = await owner()
    const first = (await (await call('POST', '/pets/10/conditions/1/archive', { token })).json()) as Condition
    expect(first.archived_at).not.toBeNull()
    const again = (await (await call('POST', '/pets/10/conditions/1/archive', { token })).json()) as Condition
    expect(again.archived_at).toBe(first.archived_at)
    const list = (await (await call('GET', '/pets/10/conditions', { token })).json()) as Condition[]
    expect(list.map((item) => item.id)).toEqual([2])
    expect((await call('POST', '/pets/10/conditions/2/archive', { token })).status).toBe(403)
  })
})

describe('дневник', () => {
  it('от новых дат к старым, в один день — от последней добавленной; период включительно', async () => {
    const token = await owner()
    await call('POST', '/pets/10/observations', { token, body: { date: '2026-10-24', note: 'Вечером' } })
    const all = (await (await call('GET', '/pets/10/observations', { token })).json()) as Observation[]
    expect(all.map((item) => [item.date, item.note ?? item.symptoms ?? item.weight])).toEqual([
      ['2026-10-24', 'Вечером'],
      ['2026-10-24', 'Гуляли час, бодрый'],
      ['2026-10-20', 'Хромает на заднюю лапу после прогулки'],
      ['2026-10-10', 31.5],
    ])
    const period = (await (
      await call('GET', '/pets/10/observations?date_from=2026-10-10&date_to=2026-10-20', { token })
    ).json()) as Observation[]
    expect(period.map((item) => item.date)).toEqual(['2026-10-20', '2026-10-10'])
  })

  it('параметры периода: формат и порядок — 422 в loc query', async () => {
    const token = await owner()
    const invalid = await call('GET', '/pets/10/observations?date_from=10.10.2026', { token })
    expect(await fieldsOf(invalid)).toEqual(['query.date_from'])
    const reversed = await call('GET', '/pets/10/observations?date_from=2026-10-20&date_to=2026-10-10', { token })
    expect(await fieldsOf(reversed)).toEqual(['query.date_to'])
  })

  it('добавление: нужна дата и хотя бы одно поле — иначе 422 с loc body; пустые строки не считаются', async () => {
    const token = await owner()
    const empty = await call('POST', '/pets/10/observations', { token, body: { date: '2026-10-25', note: '   ' } })
    expect(empty.status).toBe(422)
    expect(await fieldsOf(empty)).toEqual(['body'])
    const noDate = await call('POST', '/pets/10/observations', { token, body: { weight: 4.2 } })
    expect(await fieldsOf(noDate)).toEqual(['body.date'])
    const created = await call('POST', '/pets/10/observations', {
      token,
      body: { date: '2026-10-25', weight: 31.25, energy: 'high', symptoms: '  ', note: 'Бегал' },
    })
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({ weight: 31.25, energy: 'high', appetite: null, symptoms: null, note: 'Бегал', source: 'owner' })
  })

  it('вес — число от 0,1 до 200, не больше двух знаков; уровни — low/normal/high; дата — не в будущем', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-26T09:00:00Z'))
    const token = await owner()
    const status = async (body: Record<string, unknown>) =>
      (await call('POST', '/pets/10/observations', { token, body: { date: '2026-10-26', ...body } })).status
    expect(await status({ weight: 0.1 })).toBe(201)
    expect(await status({ weight: 200 })).toBe(201)
    expect(await status({ weight: 0.09 })).toBe(422)
    expect(await status({ weight: 200.01 })).toBe(422)
    expect(await status({ weight: 4.255 })).toBe(422)
    expect(await status({ weight: '4.2' })).toBe(422)
    expect(await status({ appetite: 'good' })).toBe(422)
    expect(await status({ appetite: null, note: 'ок' })).toBe(201)
    expect(await status({ date: '2026-10-27', note: 'завтра' })).toBe(422)
  })

  it('правка своего наблюдения: только присланные поля; опустошить нельзя; наблюдение клиники — 403', async () => {
    const token = await owner()
    const fixed = await call('PATCH', '/pets/10/observations/3', { token, body: { weight: 31.1, note: null } })
    expect(await fixed.json()).toMatchObject({ weight: 31.1, note: null, appetite: 'normal' })
    const emptied = await call('PATCH', '/pets/10/observations/2', {
      token,
      body: { appetite: null, energy: null, symptoms: '' },
    })
    expect(emptied.status).toBe(422)
    expect(await fieldsOf(emptied)).toEqual(['body'])
    expect(readServer().observations.find((item) => item.id === 2)?.appetite).toBe('low')
    expect((await call('PATCH', '/pets/10/observations/2', { token, body: { date: null } })).status).toBe(422)
    expect((await call('PATCH', '/pets/10/observations/1', { token, body: { weight: 31 } })).status).toBe(403)
  })
})

describe('прививки', () => {
  it('свои и от клиники, от новых дат к старым', async () => {
    const list = (await (await call('GET', '/pets/10/vaccinations', { token: await owner() })).json()) as Vaccination[]
    expect(list.map((item) => [item.name, item.source])).toEqual([
      ['Нобивак DHPPi', 'clinic'],
      ['Нобивак Rabies', 'owner'],
    ])
  })

  it('добавление: следующая — строго позже прививки и может быть в прошлом; без следующей — null', async () => {
    const token = await owner()
    const sameDay = await call('POST', '/pets/11/vaccinations', {
      token,
      body: { name: 'Мультифел', date: '2026-01-10', next_date: '2026-01-10' },
    })
    expect(await fieldsOf(sameDay)).toEqual(['body.next_date'])
    const overdue = await call('POST', '/pets/11/vaccinations', {
      token,
      body: { name: ' Мультифел ', date: '2025-01-10', next_date: '2026-01-10' },
    })
    expect(overdue.status).toBe(201)
    expect(await overdue.json()).toMatchObject({ name: 'Мультифел', source: 'owner', appointment_id: null })
    const once = await call('POST', '/pets/11/vaccinations', { token, body: { name: 'Разовая', date: '2026-02-01' } })
    expect(await once.json()).toMatchObject({ next_date: null })
    const invalid = await call('POST', '/pets/11/vaccinations', { token, body: { name: '', date: '2026-02-30' } })
    expect(await fieldsOf(invalid)).toEqual(['body.date', 'body.name'])
  })

  it('изменение: порядок дат — по итоговым значениям, после поиска; null убирает следующую', async () => {
    const token = await owner()
    // Новая дата прививки позже прежней следующей — 422 у next_date.
    const crossed = await call('PATCH', '/pets/10/vaccinations/1', { token, body: { date: '2026-02-01', next_date: '2026-01-20' } })
    expect(await fieldsOf(crossed)).toEqual(['body.next_date'])
    expect((await call('PATCH', '/pets/10/vaccinations/999', { token, body: { next_date: '2020-01-01' } })).status).toBe(404)
    const cleared = await call('PATCH', '/pets/10/vaccinations/1', { token, body: { next_date: null } })
    expect(await cleared.json()).toMatchObject({ date: '2026-01-15', next_date: null })
    expect((await call('PATCH', '/pets/10/vaccinations/1', { token, body: { name: null } })).status).toBe(422)
  })

  it('удаление своей — 204, повтор — 404; прививку клиники — 403', async () => {
    const token = await owner()
    expect((await call('DELETE', '/pets/10/vaccinations/1', { token })).status).toBe(204)
    expect((await call('DELETE', '/pets/10/vaccinations/1', { token })).status).toBe(404)
    expect((await call('DELETE', '/pets/10/vaccinations/2', { token })).status).toBe(403)
    expect(readServer().vaccinations.some((item) => item.id === 2)).toBe(true)
  })
})
