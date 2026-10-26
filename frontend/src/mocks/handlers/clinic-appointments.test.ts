import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiBaseUrl } from '../../api/base-url'
import type { Appointment, ClinicPetCard, NotificationList, Observation } from '../../api/schema'
import { readServer, SEED_PASSWORD, updateServer } from '../server-state'
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

const clinic = () => accessToken('clinic@example.com')
const owner = () => accessToken('owner@example.com')
const ids = async (response: Response) => ((await response.json()) as Appointment[]).map((item) => item.id)

async function fieldsOf(response: Response): Promise<string[]> {
  return ((await response.json()) as { detail: { loc: string[] }[] }).detail.map((item) => item.loc.join('.')).sort()
}

const notifications = async (token: string) => (await (await call('GET', '/notifications', { token })).json()) as NotificationList

// Среда, 28 октября 2026, 09:00 по Москве. Записи «ВетДоктора»: №22 — 12.10 (итог), №23 — 23.10 (отменена клиникой),
// №24 — четверг 29.10 09:00 (заявка Барсика к Ким), №20 и №25 — пятница 30.10 10:00 и 10:30 (подтверждены, Петров),
// №21 — понедельник 02.11 15:30 (заявка Майло к Ким).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-28T06:00:00Z'))
  resetMockServer()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('записи клиники: список и фильтры', () => {
  it('только своя клиника, от ранних к поздним; владелец — 403', async () => {
    expect((await call('GET', '/clinic/appointments', { token: await owner() })).status).toBe(403)
    expect(await ids(await call('GET', '/clinic/appointments', { token: await clinic() }))).toEqual([22, 23, 24, 20, 25, 21])
  })

  it('фильтры складываются через «и»: дни включительно, статус, врач', async () => {
    const token = await clinic()
    expect(await ids(await call('GET', '/clinic/appointments?date_from=2026-10-30&date_to=2026-10-30', { token }))).toEqual([20, 25])
    expect(await ids(await call('GET', '/clinic/appointments?status=requested', { token }))).toEqual([24, 21])
    expect(await ids(await call('GET', '/clinic/appointments?vet_id=6&date_from=2026-10-30', { token }))).toEqual([21])
    // Архивный врач своей клиники — допустимый фильтр.
    expect(await ids(await call('GET', '/clinic/appointments?vet_id=7', { token }))).toEqual([])
  })

  it('неверные фильтры и врач другой клиники — 422 в loc query', async () => {
    const token = await clinic()
    for (const [query, field] of [
      ['status=done', 'query.status'],
      ['date_from=30.10.2026', 'query.date_from'],
      ['vet_id=8', 'query.vet_id'],
      ['awaiting_outcome=yes', 'query.awaiting_outcome'],
    ]) {
      expect(await fieldsOf(await call('GET', `/clinic/appointments?${query}`, { token }))).toEqual([field])
    }
  })

  it('«Ждут итога» — подтверждённые, время которых наступило; «Требуют решения» — будущие записи недоступного врача', async () => {
    const token = await clinic()
    expect(await ids(await call('GET', '/clinic/appointments?awaiting_outcome=true', { token }))).toEqual([])
    updateServer((state) => {
      const kim = state.vets.find((vet) => vet.id === 6)
      if (kim) kim.on_vacation = true
    })
    expect(await ids(await call('GET', '/clinic/appointments?requires_decision=true', { token }))).toEqual([24, 21])
    vi.setSystemTime(new Date('2026-10-30T08:00:00Z'))
    expect(await ids(await call('GET', '/clinic/appointments?awaiting_outcome=true', { token }))).toEqual([20, 25])
    // Прошедшая заявка 24 решения уже не требует: её время прошло.
    expect(await ids(await call('GET', '/clinic/appointments?requires_decision=true', { token }))).toEqual([21])
  })
})

describe('записи клиники: подтверждение и отмена', () => {
  it('подтверждение заявки — владельцу уведомление; повтор и не заявка — 409', async () => {
    const token = await clinic()
    const confirmed = await call('POST', '/clinic/appointments/24/confirm', { token })
    expect(await confirmed.json()).toMatchObject({ id: 24, status: 'confirmed' })
    expect((await call('POST', '/clinic/appointments/24/confirm', { token })).status).toBe(409)
    expect((await call('POST', '/clinic/appointments/20/confirm', { token })).status).toBe(409)
    const list = await notifications(await owner())
    expect(list.items[0]).toMatchObject({
      type: 'appointment_confirmed',
      text: 'Клиника «ВетДоктор» подтвердила запись: Барсик, 29 октября в 09:00, врач Ким Е. В.',
      link: '/appointments/24',
      read_at: null,
    })
  })

  it('прошедшую заявку не подтвердить — 409; отменить можно', async () => {
    const token = await clinic()
    vi.setSystemTime(new Date('2026-10-29T07:00:00Z'))
    const late = await call('POST', '/clinic/appointments/24/confirm', { token })
    expect(late.status).toBe(409)
    expect(await late.json()).toEqual({ detail: 'Время приёма уже прошло' })
    expect((await call('POST', '/clinic/appointments/24/cancel', { token, body: { comment: 'Не пришли' } })).status).toBe(200)
  })

  it('отмена: комментарий обязателен и до 500 символов; владельцу — текст с комментарием; конечный статус — 409', async () => {
    const token = await clinic()
    expect(await fieldsOf(await call('POST', '/clinic/appointments/21/cancel', { token, body: { comment: '   ' } }))).toEqual([
      'body.comment',
    ])
    expect(
      await fieldsOf(await call('POST', '/clinic/appointments/21/cancel', { token, body: { comment: 'х'.repeat(501) } })),
    ).toEqual(['body.comment'])
    const cancelled = await call('POST', '/clinic/appointments/21/cancel', {
      token,
      body: { comment: ' Врач на конференции.\nПерезапишитесь, пожалуйста ' },
    })
    expect(await cancelled.json()).toMatchObject({
      status: 'cancelled',
      cancelled_by: 'clinic',
      clinic_comment: 'Врач на конференции.\nПерезапишитесь, пожалуйста',
    })
    expect((await call('POST', '/clinic/appointments/21/cancel', { token, body: { comment: 'Ещё раз' } })).status).toBe(409)
    expect((await notifications(await owner())).items[0]).toMatchObject({
      type: 'appointment_cancelled_by_clinic',
      link: '/appointments/21',
    })
  })

  it('запись другой клиники — 404', async () => {
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
    const zoovet = await accessToken('zoovet@example.com')
    expect((await call('POST', '/clinic/appointments/24/confirm', { token: zoovet })).status).toBe(404)
    expect(await ids(await call('GET', '/clinic/appointments', { token: zoovet }))).toEqual([])
  })
})

describe('карточка питомца для клиники', () => {
  it('особенности без архивных, прививки от новых, приёмы только этой клиники от поздних; дневник', async () => {
    const token = await clinic()
    const card = (await (await call('GET', '/clinic/pets/10', { token })).json()) as ClinicPetCard
    expect(card.pet.name).toBe('Майло')
    expect(card.conditions.map((item) => item.id)).toEqual([1, 2])
    expect(card.vaccinations.map((item) => item.name)).toEqual(['Нобивак DHPPi', 'Нобивак Rabies'])
    expect(card.appointments.map((item) => item.id)).toEqual([21, 20, 23, 22])
    const diary = (await (await call('GET', '/clinic/pets/10/observations', { token })).json()) as Observation[]
    expect(diary.map((item) => item.date)).toEqual(['2026-10-24', '2026-10-20', '2026-10-10'])
  })

  it('без неотменённой записи в эту клинику — 404; после отмены единственной записи — тоже', async () => {
    const token = await clinic()
    expect((await call('GET', '/clinic/pets/12', { token })).status).toBe(404)
    expect((await call('GET', '/clinic/pets/11', { token })).status).toBe(200)
    await call('POST', '/clinic/appointments/24/cancel', { token, body: { comment: 'Нет мест' } })
    expect((await call('GET', '/clinic/pets/11', { token })).status).toBe(404)
    expect((await call('GET', '/clinic/pets/11/observations', { token })).status).toBe(404)
  })
})

describe('уведомления', () => {
  it('у каждого свои, от новых к старым; администратор — 403; limit — от 1 до 50', async () => {
    const ownerList = await notifications(await owner())
    expect(ownerList.unread_count).toBe(3)
    expect(ownerList.items).toHaveLength(5)
    expect(ownerList.items.map((item) => item.created_at)).toEqual([...ownerList.items.map((item) => item.created_at)].sort().reverse())
    const clinicList = await notifications(await clinic())
    expect(clinicList.unread_count).toBe(2)
    expect(clinicList.items[0].link).toMatch(/^\/clinic\/appointments\?date_from=\d{4}-\d{2}-\d{2}&date_to=\d{4}-\d{2}-\d{2}$/)
    expect((await call('GET', '/notifications', { token: await accessToken('admin@example.com') })).status).toBe(403)
    expect((await call('GET', '/notifications?limit=0', { token: await owner() })).status).toBe(422)
    expect(((await (await call('GET', '/notifications?limit=2', { token: await owner() })).json()) as NotificationList).items).toHaveLength(2)
  })

  it('прочитать одно и все; повторно — 204; чужое — 404', async () => {
    const token = await owner()
    const [first] = (await notifications(token)).items
    expect((await call('POST', `/notifications/${first.id}/read`, { token })).status).toBe(204)
    expect((await call('POST', `/notifications/${first.id}/read`, { token })).status).toBe(204)
    expect((await notifications(token)).unread_count).toBe(2)
    const clinicItem = (await notifications(await clinic())).items[0]
    expect((await call('POST', `/notifications/${clinicItem.id}/read`, { token })).status).toBe(404)
    expect((await call('POST', '/notifications/read-all', { token })).status).toBe(204)
    expect(await (await call('GET', '/notifications/unread-count', { token })).json()).toEqual({ unread_count: 0 })
  })

  it('запись, отмена владельцем и архив питомца — клинике; автор действия уведомление не получает', async () => {
    const token = await owner()
    await call('POST', '/appointments', {
      token,
      body: { pet_id: 11, vet_id: 4, slot_start: '2026-10-30T11:00:00+03:00', reason: 'checkup' },
    })
    await call('POST', '/appointments/20/cancel', { token })
    await call('POST', '/pets/10/archive', { token })
    const texts = (await notifications(await clinic())).items.slice(0, 3).map((item) => item.text)
    expect(texts).toEqual([
      'Запись отменена — питомец в архиве: Майло, 2 ноября в 15:30',
      'Владелец отменил запись: Майло, 30 октября в 10:00, врач Петров П. П.',
      'Новая заявка: Барсик, 30 октября в 11:00, врач Петров П. П.',
    ])
    expect((await notifications(token)).items).toHaveLength(5)
  })

  it('скрытие клиники — владельцам уведомления об отмене', async () => {
    await call('POST', '/admin/clinics/2/archive', { token: await accessToken('admin@example.com') })
    const ownerTexts = readServer()
      .notifications.filter((item) => item.user_id === 1 && item.type === 'appointment_cancelled_clinic_unavailable')
      .map((item) => item.text)
    expect(ownerTexts).toContain('Запись отменена — клиника «ВетДоктор» больше не принимает: Майло, 30 октября в 10:00')
  })
})
