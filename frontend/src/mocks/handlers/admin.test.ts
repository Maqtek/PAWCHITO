import { describe, expect, it } from 'vitest'
import type { AdminClinic, components, User } from '../../api/schema'
import { accessToken, admin, bodyFields, call, login, refresh } from '../../test/mock-api'
import { readServer, updateServer, writeMockCookie } from '../server-state'
import { readMockCookie } from '../session'

type Schemas = components['schemas']

const NEW_CLINIC = {
  name: 'Лапа',
  address: 'ул. Мира, 1',
  phone: '+79997778899',
  opens_at: '09:00',
  closes_at: '18:00',
  work_days: [1, 2, 3, 4, 5],
}

const TEMPORARY = /^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){2}$/

describe('админка: доступ', () => {
  it('гость — 401, владелец и клиника — 403', async () => {
    expect((await call('GET', '/admin/clinics')).status).toBe(401)
    expect((await call('GET', '/admin/clinics', { token: await accessToken('owner@example.com') })).status).toBe(403)
    expect((await call('GET', '/admin/clinics', { token: await accessToken('clinic@example.com') })).status).toBe(403)
  })
})

describe('админка: клиники', () => {
  it('список со скрытыми, аккаунтами и числом будущих записей', async () => {
    const list = (await (await call('GET', '/admin/clinics', { token: await admin() })).json()) as AdminClinic[]
    expect(list.map((clinic) => clinic.name)).toEqual(['ВетДоктор', 'Клиника «Новая»', 'Зоовет', 'Айболит'])
    expect(list[0]).toMatchObject({
      id: 2,
      archived_at: null,
      account: { id: 6, email: 'clinic@example.com', is_active: true },
      future_appointments_count: 7,
    })
    expect(list[2].account).toBeNull()
    expect(list[3].archived_at).not.toBeNull()
    expect(list[3].account).toMatchObject({ email: 'aibolit@example.com', is_active: false })
  })

  it('создание: 422 по всем полям сразу, порядок часов, затем 201', async () => {
    const token = await admin()
    const bad = await call('POST', '/admin/clinics', {
      token,
      body: { name: ' ', address: 'а'.repeat(201), phone: '8999', opens_at: '09:15', closes_at: 'x', work_days: [] },
    })
    expect(bad.status).toBe(422)
    expect(await bodyFields(bad)).toEqual(['address', 'closes_at', 'name', 'opens_at', 'phone', 'work_days'])

    const order = await call('POST', '/admin/clinics', { token, body: { ...NEW_CLINIC, opens_at: '18:00', closes_at: '09:00' } })
    expect(order.status).toBe(422)
    expect(((await order.json()) as { detail: { loc: string[] }[] }).detail[0].loc).toEqual(['body', 'closes_at'])

    const created = await call('POST', '/admin/clinics', { token, body: { ...NEW_CLINIC, name: '  Лапа ' } })
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({
      ...NEW_CLINIC,
      archived_at: null,
      account: null,
      future_appointments_count: 0,
    })
  })

  it('PATCH меняет только присланные поля, порядок часов — по итоговым значениям; 404', async () => {
    const token = await admin()
    const patched = await call('PATCH', '/admin/clinics/2', { token, body: { phone: '+79991112233', closes_at: '21:00' } })
    expect(await patched.json()).toMatchObject({ name: 'ВетДоктор', phone: '+79991112233', opens_at: '09:00', closes_at: '21:00' })
    expect((await call('PATCH', '/admin/clinics/2', { token, body: { closes_at: '08:00' } })).status).toBe(422)
    expect((await call('PATCH', '/admin/clinics/999', { token, body: { phone: '+79991112233' } })).status).toBe(404)
    expect((await call('GET', '/admin/clinics/abc', { token })).status).toBe(404)
  })

  it('скрытие: записи отменены, аккаунт заблокирован, сессии отозваны, вход — 403; повтор ничего не отменяет', async () => {
    const clinicToken = await accessToken('clinic@example.com')
    const clinicCookie = readMockCookie()
    const token = await admin()

    const archived = await call('POST', '/admin/clinics/2/archive', { token })
    expect(archived.status).toBe(200)
    const body = (await archived.json()) as Schemas['ClinicArchived']
    expect(body.cancelled_appointments).toBe(7)
    expect(body.clinic.archived_at).not.toBeNull()
    expect(body.clinic.account?.is_active).toBe(false)

    expect((await call('GET', '/notifications/unread-count', { token: clinicToken })).status).toBe(403)
    expect((await login('clinic@example.com')).status).toBe(403)
    writeMockCookie(clinicCookie)
    expect((await refresh()).status).toBe(401)

    const again = await call('POST', '/admin/clinics/2/archive', { token })
    expect(((await again.json()) as Schemas['ClinicArchived']).cancelled_appointments).toBe(0)
  })

  it('возврат: аккаунт снова активен, вход работает, записи не возвращаются', async () => {
    const token = await admin()
    await call('POST', '/admin/clinics/2/archive', { token })
    const restored = await call('POST', '/admin/clinics/2/restore', { token })
    expect(await restored.json()).toMatchObject({ archived_at: null, account: { is_active: true }, future_appointments_count: 0 })
    expect((await login('clinic@example.com')).status).toBe(200)
  })
})

describe('админка: правила полей (контракты, раздел 9)', () => {
  it('время — ровно ЧЧ:ММ с минутами 00/30, в пределах суток', async () => {
    const token = await admin()
    for (const time of ['9:00', '09:00:00', '24:00', '09:15', '09:00+03:00']) {
      const response = await call('POST', '/admin/clinics', { token, body: { ...NEW_CLINIC, opens_at: time } })
      expect(response.status).toBe(422)
    }
    expect((await call('POST', '/admin/clinics', { token, body: { ...NEW_CLINIC, opens_at: '00:00', closes_at: '23:30' } })).status).toBe(201)
  })

  it('неверное время открытия — ошибка только у него, порядок часов не проверяется', async () => {
    const token = await admin()
    const response = await call('POST', '/admin/clinics', { token, body: { ...NEW_CLINIC, opens_at: '9:00', closes_at: '10:00' } })
    expect(response.status).toBe(422)
    expect(await bodyFields(response)).toEqual(['opens_at'])
  })

  it('дни — строгие целые 1–7 без повторов; ответ отсортирован', async () => {
    const token = await admin()
    for (const days of [['3'], [true], [1.5], [0], [8], [1, 1]]) {
      const response = await call('POST', '/admin/clinics', { token, body: { ...NEW_CLINIC, work_days: days } })
      expect(response.status).toBe(422)
    }
    const created = await call('POST', '/admin/clinics', { token, body: { ...NEW_CLINIC, work_days: [5, 1, 3] } })
    expect(((await created.json()) as AdminClinic).work_days).toEqual([1, 3, 5])
  })

  it('телефон сервер не нормализует; название не уникально', async () => {
    const token = await admin()
    expect((await call('POST', '/admin/clinics', { token, body: { ...NEW_CLINIC, phone: '8 999 777-88-99' } })).status).toBe(422)
    expect((await call('POST', '/admin/clinics', { token, body: { ...NEW_CLINIC, name: 'ВетДоктор' } })).status).toBe(201)
  })

  it('PATCH: явный null — 422, пустое тело — 200 без изменений', async () => {
    const token = await admin()
    for (const field of ['name', 'address', 'phone', 'opens_at', 'closes_at', 'work_days']) {
      const response = await call('PATCH', '/admin/clinics/2', { token, body: { [field]: null } })
      expect(response.status).toBe(422)
    }
    const unchanged = await call('PATCH', '/admin/clinics/2', { token, body: {} })
    expect(unchanged.status).toBe(200)
    expect(await unchanged.json()).toMatchObject({ name: 'ВетДоктор', phone: '+79990000000', work_days: [1, 2, 3, 4, 5, 6] })
  })
})

describe('админка: аккаунт клиники', () => {
  it('создание: 201 и временный пароль; вход с ним требует смены пароля', async () => {
    const token = await admin()
    const created = await call('POST', '/admin/clinics/4/account', { token, body: { email: ' zoovet@example.com ' } })
    expect(created.status).toBe(201)
    const body = (await created.json()) as Schemas['ClinicAccountCreated']
    expect(body.user).toMatchObject({ email: 'zoovet@example.com', role: 'clinic', full_name: 'Зоовет', must_change_password: true })
    expect(body.temporary_password).toMatch(TEMPORARY)

    const clinicToken = await accessToken('zoovet@example.com', body.temporary_password)
    const bell = await call('GET', '/notifications/unread-count', { token: clinicToken })
    expect(await bell.json()).toEqual({ detail: 'password_change_required' })
  })

  it('409: у клиники уже есть аккаунт или email занят; 422 — формат email', async () => {
    const token = await admin()
    expect((await call('POST', '/admin/clinics/2/account', { token, body: { email: 'other@example.com' } })).status).toBe(409)
    expect((await call('POST', '/admin/clinics/4/account', { token, body: { email: 'OWNER@example.com' } })).status).toBe(409)
    expect((await call('POST', '/admin/clinics/4/account', { token, body: { email: 'not-an-email' } })).status).toBe(422)
  })

  it('сброс: новый временный пароль, флаг смены, сессии отозваны, старый пароль не подходит', async () => {
    await login('clinic@example.com')
    const clinicCookie = readMockCookie()
    const token = await admin()
    const reset = await call('POST', '/admin/clinics/2/account/reset-password', { token })
    expect(reset.status).toBe(200)
    const { temporary_password: temporary } = (await reset.json()) as Schemas['TemporaryPassword']
    expect(temporary).toMatch(TEMPORARY)

    writeMockCookie(clinicCookie)
    expect((await refresh()).status).toBe(401)
    expect((await login('clinic@example.com')).status).toBe(401)
    expect((await login('clinic@example.com', temporary)).status).toBe(200)
    expect(readServer().accounts.find((item) => item.id === 6)?.must_change_password).toBe(true)
  })

  it('сброс снимает паузу после неудачных попыток; без аккаунта — 404', async () => {
    updateServer((state) => {
      state.attempts['clinic@example.com'] = { failures: 0, lockedUntil: Date.now() + 60_000 }
    })
    const token = await admin()
    const reset = await call('POST', '/admin/clinics/2/account/reset-password', { token })
    const { temporary_password: temporary } = (await reset.json()) as Schemas['TemporaryPassword']
    expect((await login('clinic@example.com', temporary)).status).toBe(200)

    const missing = await call('POST', '/admin/clinics/4/account/reset-password', { token })
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ detail: 'У клиники нет аккаунта' })
  })

  it('имя аккаунта — название клиники: после переименования админом сразу новое в /users/me (Р-35)', async () => {
    const clinicToken = await accessToken('clinic@example.com')
    const name = async () => ((await (await call('GET', '/users/me', { token: clinicToken })).json()) as User).full_name
    expect(await name()).toBe('ВетДоктор')

    await call('PATCH', '/admin/clinics/2', { token: await admin(), body: { name: 'ВетДоктор на Ленина' } })
    expect(await name()).toBe('ВетДоктор на Ленина')
  })
})
