import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiBaseUrl } from '../../api/base-url'
import type { OutcomeResult, Pet } from '../../api/schema'
import { readServer, SEED_PASSWORD } from '../server-state'
import { resetMockServer, startMockVisit } from '../session'

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

async function locs(response: Response): Promise<string[]> {
  return ((await response.json()) as { detail: { loc: (string | number)[] }[] }).detail.map((item) => item.loc.join('.')).sort()
}

/**
 * Фото вручную собранным multipart: FormData из jsdom не отправляется через fetch из Node,
 * а сервер (и моки) разбирают обычный multipart/form-data.
 */
function uploadPhoto(token: string, petId: number, bytes: Uint8Array, type = 'image/png') {
  const boundary = 'pawchito-test-boundary'
  const encoder = new TextEncoder()
  const head = encoder.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo"\r\nContent-Type: ${type}\r\n\r\n`,
  )
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`)
  const body = new Uint8Array(head.length + bytes.length + tail.length)
  body.set(head)
  body.set(bytes, head.length)
  body.set(tail, head.length + bytes.length)
  return fetch(`${apiBaseUrl()}/clinic/pets/${petId}/photo`, {
    method: 'PUT',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, Authorization: `Bearer ${token}` },
    body,
  })
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])

const FULL_OUTCOME = {
  conclusion: '  Отит правого уха  ',
  recommendations: 'Повторный осмотр через 10 дней',
  care_status: 'treatment',
  prescriptions: [{ drug: 'Амоксициллин', dosage: '1 таблетка 250 мг', times: ['21:00', '09:00'], duration_days: 7 }],
  vaccinations: [{ name: 'Рабис', date: '2026-10-30', next_date: '2027-10-30' }],
  conditions: [{ kind: 'chronic', title: 'Хронический отит', description: null }],
  pet_update: { weight: 31.4, breed: 'Лабрадор', sex: 'male' },
}

// Seed пересчитан от среды 28 октября 2026: запись №20 Майло к Петрову — пятница 30.10 в 10:00, подтверждена.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-28T06:00:00Z'))
  resetMockServer()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Пятница 30.10, 10:30 по Москве — приём №20 уже идёт. */
const afterVisit = () => vi.setSystemTime(new Date('2026-10-30T07:30:00Z'))

describe('итог приёма: когда можно', () => {
  it('до начала приёма, у заявки и повторно — 409; запись другой клиники — 404', async () => {
    const token = await clinic()
    const early = await call('POST', '/clinic/appointments/20/outcome', { token, body: FULL_OUTCOME })
    expect(early.status).toBe(409)
    expect(await early.json()).toEqual({ detail: 'Время приёма ещё не наступило' })
    afterVisit()
    expect((await call('POST', '/clinic/appointments/21/outcome', { token, body: FULL_OUTCOME })).status).toBe(409)
    const done = await call('POST', '/clinic/appointments/22/outcome', { token, body: FULL_OUTCOME })
    expect(await done.json()).toEqual({ detail: 'Итог уже внесён' })
    expect((await call('POST', '/clinic/appointments/999/outcome', { token, body: FULL_OUTCOME })).status).toBe(404)
  })
})

describe('итог приёма: поля', () => {
  it('без заключения и статуса, ошибки рецепта — 422 с индексом в loc, до поиска записи', async () => {
    const token = await clinic()
    const response = await call('POST', '/clinic/appointments/999/outcome', {
      token,
      body: {
        conclusion: '   ',
        prescriptions: [{ drug: 'Амоксициллин', dosage: '', times: ['9:00', '9:00'], duration_days: 0 }],
        vaccinations: [{ name: 'Рабис', date: '30.10.2026' }],
      },
    })
    expect(await locs(response)).toEqual([
      'body.care_status',
      'body.conclusion',
      'body.prescriptions.0.dosage',
      'body.prescriptions.0.duration_days',
      'body.prescriptions.0.times',
      'body.vaccinations.0.date',
    ])
  })

  it('даты относительно дня приёма — после поиска записи: начало рецепта раньше приёма, прививка в будущем', async () => {
    afterVisit()
    const token = await clinic()
    const response = await call('POST', '/clinic/appointments/20/outcome', {
      token,
      body: {
        ...FULL_OUTCOME,
        prescriptions: [{ ...FULL_OUTCOME.prescriptions[0], start_date: '2026-10-29' }],
        vaccinations: [{ name: 'Рабис', date: '2026-10-31' }],
      },
    })
    expect(await locs(response)).toEqual(['body.prescriptions.0.start_date', 'body.vaccinations.0.date'])
    expect(readServer().appointments.find((item) => item.id === 20)?.status).toBe('confirmed')
  })

  it('не больше 10 рецептов', async () => {
    const token = await clinic()
    const prescriptions = Array.from({ length: 11 }, () => FULL_OUTCOME.prescriptions[0])
    expect(await locs(await call('POST', '/clinic/appointments/20/outcome', { token, body: { ...FULL_OUTCOME, prescriptions } }))).toEqual([
      'body.prescriptions',
    ])
  })
})

describe('итог приёма: сохранение', () => {
  it('одной транзакцией: запись, рецепты, дела, прививки, вес, данные, статус ухода, уведомления', async () => {
    afterVisit()
    const response = await call('POST', '/clinic/appointments/20/outcome', { token: await clinic(), body: FULL_OUTCOME })
    expect(response.status).toBe(200)
    const result = (await response.json()) as OutcomeResult
    // 7 дней × 2 приёма, утренний 30.10 в 09:00 уже прошёл.
    expect(result.created_reminders).toBe(13)
    expect(result.appointment).toMatchObject({ status: 'completed' })
    expect(result.appointment.outcome).toMatchObject({
      conclusion: 'Отит правого уха',
      care_status: 'treatment',
      completed_at: '2026-10-30T10:30:00+03:00',
      prescriptions: [{ drug: 'Амоксициллин', times: ['09:00', '21:00'], duration_days: 7, start_date: '2026-10-30' }],
      vaccinations: [{ name: 'Рабис', source: 'clinic', appointment_id: 20 }],
    })

    const state = readServer()
    const pet = state.pets.find((item) => item.id === 10)
    expect(pet).toMatchObject({
      breed: 'Лабрадор',
      care_status: 'treatment',
      care_status_set_at: '2026-10-30T10:30:00+03:00',
      care_status_clinic: { id: 2, name: 'ВетДоктор' },
    })
    expect(state.observations.at(-1)).toMatchObject({ pet_id: 10, date: '2026-10-30', weight: 31.4, source: 'clinic' })
    expect(state.conditions.at(-1)).toMatchObject({ pet_id: 10, title: 'Хронический отит', source: 'clinic' })
    expect(state.vaccinations.at(-1)).toMatchObject({ pet_id: 10, name: 'Рабис', appointment_id: 20 })

    const ownerTexts = state.notifications.filter((item) => item.user_id === 1).slice(-2).map((item) => [item.type, item.text, item.link])
    expect(ownerTexts).toEqual([
      ['outcome_added', 'Внесён итог приёма: Майло — на лечении. Дел курса: 13', '/appointments/20'],
      ['pet_updated_by_clinic', 'Клиника «ВетДоктор» обновила данные питомца Майло: вес, порода, особенности здоровья', '/pets'],
    ])
  })
})

describe('карточка питомца: изменения клиникой', () => {
  it('без связи с клиникой — 404; связь есть, но приёма не было — 403', async () => {
    const token = await clinic()
    expect((await call('PATCH', '/clinic/pets/12', { token, body: { breed: 'Корелла' } })).status).toBe(404)
    const noVisit = await call('PATCH', '/clinic/pets/11', { token, body: { breed: 'Сибирская' } })
    expect(noVisit.status).toBe(403)
    expect(await noVisit.json()).toEqual({ detail: 'Нет завершённого приёма' })
    expect((await call('POST', '/clinic/pets/11/weight', { token, body: { date: '2026-10-28', weight: 4.1 } })).status).toBe(403)
  })

  it('после приёма: порода, дата и пол; кличку и вид сервер игнорирует; вес и особенность; владельцу — что изменено', async () => {
    const token = await clinic()
    const patched = await call('PATCH', '/clinic/pets/10', {
      token,
      body: { name: 'Не Майло', species: 'cat', breed: 'Лабрадор', sex: 'male' },
    })
    expect(await patched.json()).toMatchObject({ name: 'Майло', species: 'dog', breed: 'Лабрадор' })
    expect((await call('POST', '/clinic/pets/10/weight', { token, body: { date: '2026-10-29', weight: 31 } })).status).toBe(422)
    const weight = await call('POST', '/clinic/pets/10/weight', { token, body: { date: '2026-10-28', weight: 31.3 } })
    expect(await weight.json()).toMatchObject({ weight: 31.3, source: 'clinic' })
    const condition = await call('POST', '/clinic/pets/10/conditions', { token, body: { kind: 'allergy', title: 'Аллергия на пенициллин' } })
    expect(await condition.json()).toMatchObject({ source: 'clinic', description: null })
    const texts = readServer()
      .notifications.filter((item) => item.type === 'pet_updated_by_clinic')
      .map((item) => item.text)
    expect(texts).toEqual([
      'Клиника «ВетДоктор» обновила данные питомца Майло: порода',
      'Клиника «ВетДоктор» обновила данные питомца Майло: вес',
      'Клиника «ВетДоктор» обновила данные питомца Майло: особенности здоровья',
    ])
  })
})

describe('фото питомца', () => {
  it('PNG по содержимому — фото заменено, владельцу уведомление', async () => {
    const response = await uploadPhoto(await clinic(), 10, PNG)
    expect(response.status).toBe(200)
    const { photo_url: url } = (await response.json()) as { photo_url: string }
    expect(url).toMatch(/^data:image\/png;base64,/)
    expect(readServer().pets.find((item) => item.id === 10)?.photo_url).toBe(url)
    expect(readServer().notifications.at(-1)?.text).toBe('Клиника «ВетДоктор» обновила данные питомца Майло: фото')
  })

  it('не картинка по содержимому — 415, даже с типом image/png; больше 5 МБ — 413; без приёма — 403', async () => {
    const token = await clinic()
    expect((await uploadPhoto(token, 10, new TextEncoder().encode('не фото'))).status).toBe(415)
    const big = new Uint8Array(5 * 1024 * 1024 + 1)
    big.set(PNG)
    expect((await uploadPhoto(token, 10, big)).status).toBe(413)
    expect((await uploadPhoto(token, 11, PNG)).status).toBe(403)
    expect(readServer().pets.find((item) => item.id === 10)?.photo_url).toBeNull()
  })

  it('у владельца — фото в карточке питомца', async () => {
    await uploadPhoto(await clinic(), 10, PNG)
    const pets = (await (await call('GET', '/pets', { token: await accessToken('owner@example.com') })).json()) as Pet[]
    expect(pets[0].photo_url).toMatch(/^data:image\/png/)
  })
})

describe('pawchitoMocks.startVisit', () => {
  it('подтверждённая запись переезжает на текущие полчаса и ждёт итога; заявку — нельзя', async () => {
    vi.setSystemTime(new Date('2026-10-28T11:47:00Z'))
    startMockVisit()
    expect(readServer().appointments.find((item) => item.id === 20)?.slot_start).toBe('2026-10-28T14:30:00+03:00')
    const awaiting = await call('GET', '/clinic/appointments?awaiting_outcome=true', { token: await clinic() })
    expect(((await awaiting.json()) as { id: number }[]).map((item) => item.id)).toEqual([20])
    expect(() => startMockVisit(21)).toThrow('Запись 21 не подтверждена')
  })
})
