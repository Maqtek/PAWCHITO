import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiBaseUrl } from '../../api/base-url'
import type { Calendar, CalendarEvent } from '../../api/schema'
import { SEED_PASSWORD, updateServer, type MockAppointment, type MockReminder } from '../server-state'
import { resetMockServer } from '../session'

function call(method: string, path: string, token?: string) {
  return fetch(`${apiBaseUrl()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
}

async function accessToken(email = 'owner@example.com'): Promise<string> {
  const response = await fetch(`${apiBaseUrl()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: SEED_PASSWORD }),
  })
  return ((await response.json()) as { access_token: string }).access_token
}

async function calendar(token: string, petId = 10): Promise<Calendar> {
  const response = await call('GET', `/calendar?pet_id=${petId}`, token)
  expect(response.status).toBe(200)
  return (await response.json()) as Calendar
}

/** Группы короче: «тип:id». */
const brief = (events: CalendarEvent[]) => events.map((event) => `${event.type}:${event.id}`)

function addReminder(id: number, dueAt: string, extra: Partial<MockReminder> = {}) {
  updateServer((state) => {
    state.reminders.push({
      id,
      pet_id: 10,
      source: 'custom',
      prescription_id: null,
      title: `Дело ${id}`,
      category: 'routine',
      due_at: dueAt,
      status: 'pending',
      done_at: null,
      repeat_interval_days: null,
      series_id: null,
      ...extra,
    })
  })
}

function addAppointment(id: number, slotStart: string, extra: Partial<MockAppointment> = {}) {
  updateServer((state) => {
    state.appointments.push({
      id,
      pet_id: 10,
      vet_id: 4,
      slot_start: slotStart,
      reason: 'checkup',
      reason_comment: null,
      status: 'requested',
      cancelled_by: null,
      clinic_comment: null,
      outcome: null,
      ...extra,
    })
  })
}

function addVaccination(id: number, nextDate: string | null, petId = 10) {
  updateServer((state) => {
    state.vaccinations.push({
      id,
      pet_id: petId,
      name: `Прививка ${id}`,
      date: '2026-01-10',
      next_date: nextDate,
      source: 'owner',
      appointment_id: null,
    })
  })
}

// Среда, 28 октября 2026, 09:00 по Москве. У Майло: курс Мелоксикама в 20:00 по 1 ноября (доза 27.10 — №16 —
// просрочена), «Купить корм» (№32) сегодня в 18:00, «Почистить зубы» (№31) завтра в 21:00; запись №20 — пятница 30.10
// в 10:00 (вакцинация, подтверждена), №21 — понедельник 2.11 в 15:30 (повторный приём, заявка). Сроки прививок Майло —
// в 2027 году, у Барсика — просрочен. У Барсика: запись №24 завтра в 09:00, «Капли от блох» (№33) 31.10 в 10:00.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-28T06:00:00Z'))
  resetMockServer()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('календарь: события и группы', () => {
  it('по seed: просроченное — в «Сегодня», записи «Заявка» и «Подтверждена» — по дням, по времени', async () => {
    const token = await accessToken()
    const milo = await calendar(token)
    expect(brief(milo.today)).toEqual(['reminder:16', 'reminder:32', 'reminder:17'])
    expect(brief(milo.tomorrow)).toEqual(['reminder:18', 'reminder:31'])
    expect(brief(milo.later)).toEqual(['appointment:20', 'reminder:19', 'reminder:20', 'reminder:21', 'appointment:21'])

    const barsik = await calendar(token, 11)
    expect(barsik).toEqual({
      today: [],
      tomorrow: [
        {
          type: 'appointment',
          id: 24,
          at: '2026-10-29T09:00:00+03:00',
          title: 'Плановый осмотр',
          category: 'routine',
          status: 'requested',
          clinic: { id: 2, name: 'ВетДоктор' },
          vet: { id: 6, full_name: 'Ким Елена Викторовна' },
        },
      ],
      later: [
        {
          type: 'reminder',
          id: 33,
          at: '2026-10-31T10:00:00+03:00',
          title: 'Капли от блох',
          category: 'prevention',
          status: 'pending',
          is_overdue: false,
          source: 'custom',
          repeat_interval_days: 30,
        },
      ],
    })
  })

  it('поля дела и записи — как в контракте; тип записи — по причине обращения', async () => {
    const milo = await calendar(await accessToken())
    expect(milo.today[0]).toEqual({
      type: 'reminder',
      id: 16,
      at: '2026-10-27T20:00:00+03:00',
      title: 'Мелоксикам, 1,5 мл',
      category: 'treatment',
      status: 'pending',
      is_overdue: true,
      source: 'prescription',
      repeat_interval_days: null,
    })
    expect(milo.later[0]).toEqual({
      type: 'appointment',
      id: 20,
      at: '2026-10-30T10:00:00+03:00',
      title: 'Вакцинация',
      category: 'prevention',
      status: 'confirmed',
      clinic: { id: 2, name: 'ВетДоктор' },
      vet: { id: 4, full_name: 'Петров Павел Петрович' },
    })
    expect(milo.later.at(-1)).toMatchObject({ id: 21, title: 'Повторный приём', category: 'treatment', status: 'requested' })
  })

  it('отмеченные дела, завершённые и отменённые записи не попадают; после отметки дело уходит', async () => {
    const token = await accessToken()
    // В seed у Майло прошлые дозы курса выполнены, №30 — выполненная чистка зубов, №22 и №23 — завершена и отменена.
    const all = Object.values(await calendar(token)).flat() as CalendarEvent[]
    expect(all.some((event) => event.type === 'reminder' && event.id === 30)).toBe(false)
    expect(all.some((event) => event.type === 'appointment' && (event.id === 22 || event.id === 23))).toBe(false)
    await call('POST', '/reminders/16/done', token)
    await call('POST', '/appointments/21/cancel', token)
    const after = await calendar(token)
    expect(brief(after.today)).toEqual(['reminder:32', 'reminder:17'])
    expect(brief(after.later)).not.toContain('appointment:21')
  })

  it('сроки прививок — с сегодня по сегодня + 30 дней, в начале дня; просроченный и без даты — нет', async () => {
    addVaccination(50, '2026-10-27')
    addVaccination(51, '2026-10-28')
    addVaccination(52, '2026-11-27')
    addVaccination(53, '2026-11-28')
    addVaccination(54, null)
    addVaccination(55, '2026-10-29', 11)
    const milo = await calendar(await accessToken())
    // Срок прививки сегодня — в начале дня: после просроченной вчера дозы, но раньше утренних дел.
    expect(brief(milo.today)).toEqual(['reminder:16', 'vaccination_due:51', 'reminder:32', 'reminder:17'])
    expect(milo.today[1]).toEqual({ type: 'vaccination_due', id: 51, at: '2026-10-28', title: 'Прививка 51', category: 'prevention' })
    expect(brief(milo.later).at(-1)).toBe('vaccination_due:52')
    const ids = (Object.values(milo).flat() as CalendarEvent[]).map((event) => `${event.type}:${event.id}`)
    for (const id of ['vaccination_due:50', 'vaccination_due:53', 'vaccination_due:54', 'vaccination_due:55']) {
      expect(ids).not.toContain(id)
    }
  })

  it('граница 30 дней: дело в последний день — в «Позже», на следующий — нет; давно просроченное — в «Сегодня»', async () => {
    addReminder(60, '2026-11-27T23:30:00+03:00')
    addReminder(61, '2026-11-28T00:00:00+03:00')
    // 21:30 UTC 27.11 — уже 28.11 по Москве.
    addReminder(62, '2026-11-27T21:30:00Z')
    addReminder(63, '2026-09-01T10:00:00+03:00')
    const milo = await calendar(await accessToken())
    expect(brief(milo.later).at(-1)).toBe('reminder:60')
    expect(brief(milo.later)).not.toContain('reminder:61')
    expect(brief(milo.later)).not.toContain('reminder:62')
    expect(milo.today[0]).toMatchObject({ id: 63, is_overdue: true })
  })

  it('запись на сегодня — до конца дня, даже если время прошло; вчерашняя без итога — нет', async () => {
    addAppointment(70, '2026-10-28T08:00:00+03:00', { status: 'confirmed' })
    addAppointment(71, '2026-10-27T15:00:00+03:00', { status: 'confirmed' })
    addAppointment(72, '2026-11-28T10:00:00+03:00')
    // Вечер того же дня: и запись, и дела дня ещё в «Сегодня».
    vi.setSystemTime(new Date('2026-10-28T20:59:00Z'))
    const token = await accessToken()
    const milo = await calendar(token)
    expect(brief(milo.today)).toEqual(['reminder:16', 'appointment:70', 'reminder:32', 'reminder:17'])
    expect(milo.today[1]).toMatchObject({ status: 'confirmed', title: 'Плановый осмотр', category: 'routine' })
    const all = (Object.values(milo).flat() as CalendarEvent[]).map((event) => `${event.type}:${event.id}`)
    expect(all).not.toContain('appointment:71')
    expect(all).not.toContain('appointment:72')
    // Наступил новый день — вчерашняя запись из календаря ушла, а вчерашние дела остались в «Сегодня» просроченными.
    vi.setSystemTime(new Date('2026-10-28T21:00:00Z'))
    const next = await calendar(token)
    expect(brief(next.today)).toEqual(['reminder:16', 'reminder:32', 'reminder:17', 'reminder:18', 'reminder:31'])
    expect(next.today[1]).toMatchObject({ is_overdue: true })
  })

  it('при равном времени — дело, запись, прививка, затем id', async () => {
    addVaccination(80, '2026-11-05')
    addAppointment(81, '2026-11-05T00:00:00+03:00')
    addReminder(83, '2026-11-05T00:00:00+03:00')
    addReminder(82, '2026-11-04T21:00:00Z')
    const milo = await calendar(await accessToken())
    const day = brief(milo.later).filter((id) => ['80', '81', '82', '83'].includes(id.split(':')[1]))
    expect(day).toEqual(['reminder:82', 'reminder:83', 'appointment:81', 'vaccination_due:80'])
  })
})

describe('календарь: питомец и доступ', () => {
  it('без pet_id или не числом — 422; чужой и несуществующий — 404; архивный — как обычно', async () => {
    const token = await accessToken()
    for (const query of ['', '?pet_id=', '?pet_id=abc', '?pet_id=1.5']) {
      const response = await call('GET', `/calendar${query}`, token)
      expect(response.status).toBe(422)
      const { detail } = (await response.json()) as { detail: { loc: string[] }[] }
      expect(detail.map((item) => item.loc)).toEqual([['query', 'pet_id']])
    }
    expect((await call('GET', '/calendar?pet_id=13', token)).status).toBe(404)
    expect((await call('GET', '/calendar?pet_id=999', token)).status).toBe(404)
    addVaccination(90, '2026-11-01', 12)
    expect(await calendar(token, 12)).toEqual({
      today: [],
      tomorrow: [],
      later: [{ type: 'vaccination_due', id: 90, at: '2026-11-01', title: 'Прививка 90', category: 'prevention' }],
    })
  })

  it('гость — 401, клиника — 403', async () => {
    expect((await call('GET', '/calendar?pet_id=10')).status).toBe(401)
    expect((await call('GET', '/calendar?pet_id=10', await accessToken('clinic@example.com'))).status).toBe(403)
  })
})
