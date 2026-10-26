import { describe, expect, it } from 'vitest'
import { accessToken, call, login, refresh } from '../../test/mock-api'
import { readServer, SEED_PASSWORD, updateServer, writeMockCookie } from '../server-state'
import { loginMockAs, logoutMock, readMockCookie, requireMockPasswordChange, resetMockServer } from '../session'

const register = (email: string, fullName: string, password = 'secret123') =>
  call('POST', '/auth/register', { body: { email, password, full_name: fullName } })

/** Восстановление доступа владельца кодом code — с новым паролем newsecret1. */
const recover = (code: string) =>
  call('POST', '/auth/recover', { body: { email: 'owner@example.com', recovery_code: code, new_password: 'newsecret1' } })

describe('регистрация', () => {
  it('201: пользователь, код восстановления, токен и cookie', async () => {
    logoutMock()
    const response = await register('new@example.com', 'Новый Владелец')
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body).toMatchObject({
      user: { email: 'new@example.com', role: 'owner', full_name: 'Новый Владелец', must_change_password: false },
      token_type: 'bearer',
      expires_in: 900,
    })
    expect(body.recovery_code).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/)
    expect(readMockCookie()).not.toBeNull()
  })

  it('409: email занят без учёта регистра', async () => {
    const response = await register('OWNER@example.com', 'Двойник')
    expect(response.status).toBe(409)
  })

  it('422: пароль короче 8 символов — ошибка поля в формате FastAPI', async () => {
    const response = await register('x@example.com', 'X', 'short')
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({
      detail: [{ loc: ['body', 'password'], msg: 'Пароль должен быть не короче 8 символов', type: 'value_error' }],
    })
  })
})

describe('вход', () => {
  it('200: токен и cookie', async () => {
    logoutMock()
    const response = await login('clinic@example.com')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ access_token: 'mock-access.6.1', token_type: 'bearer', expires_in: 900 })
    expect(readMockCookie()).not.toBeNull()
  })

  it('401: неверный пароль', async () => {
    expect((await login('owner@example.com', 'wrong-pass')).status).toBe(401)
  })

  it('403: аккаунт заблокирован', async () => {
    const response = await login('blocked@example.com')
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ detail: 'Аккаунт заблокирован' })
  })

  it('429 с Retry-After после пяти неудач, даже с верным паролем', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await login('owner@example.com', 'wrong-pass')).status).toBe(401)
    }
    const response = await login('owner@example.com')
    expect(response.status).toBe(429)
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThanOrEqual(899)
  })

  it('счётчик общий для входа и восстановления', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await recover('AAAA-AAAA-AAAA-AAAA')
    }
    await login('owner@example.com', 'wrong-pass')
    await login('owner@example.com', 'wrong-pass')
    expect((await login('owner@example.com')).status).toBe(429)
  })

  it('пауза прошла — вход снова работает', async () => {
    updateServer((state) => {
      state.attempts['owner@example.com'] = { failures: 0, lockedUntil: Date.now() - 1 }
    })
    expect((await login('owner@example.com')).status).toBe(200)
  })
})

describe('refresh', () => {
  it('ротация: новая cookie, повтор старой отзывает все токены', async () => {
    const first = readMockCookie()
    expect((await refresh()).status).toBe(200)
    const second = readMockCookie()
    expect(second).not.toBe(first)

    writeMockCookie(first)
    expect((await refresh()).status).toBe(401)
    expect(readMockCookie()).toBeNull()
    expect(Object.values(readServer().refreshTokens).every((record) => record.revoked)).toBe(true)
  })

  it('без cookie — 401', async () => {
    logoutMock()
    expect((await refresh()).status).toBe(401)
  })

  it('гонка вкладок без очереди: вторая с той же cookie получает 401, токены отозваны', async () => {
    resetMockServer({ refreshDelayMs: 50 })
    loginMockAs('owner')
    const statuses = (await Promise.all([refresh(), refresh()])).map((response) => response.status)
    expect(statuses.sort()).toEqual([200, 401])
    expect(Object.values(readServer().refreshTokens).every((record) => record.revoked)).toBe(true)
  })

  it('выход: 204, cookie стёрта, обмен больше не работает', async () => {
    const presented = readMockCookie()
    expect((await call('POST', '/auth/logout')).status).toBe(204)
    expect(readMockCookie()).toBeNull()
    writeMockCookie(presented)
    expect((await refresh()).status).toBe(401)
  })
})

describe('восстановление', () => {
  it('400: неверный код', async () => {
    const response = await recover('AAAA-AAAA-AAAA-AAAA')
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ detail: 'Неверный email или код' })
  })

  it('200: новый код, новый пароль, сессии завершены; регистр кода не важен', async () => {
    const response = await recover('k7qm-2xpa-9rtd-4wnb')
    expect(response.status).toBe(200)
    const { recovery_code: code } = (await response.json()) as { recovery_code: string }
    expect(code).not.toBe('K7QM-2XPA-9RTD-4WNB')
    expect((await refresh()).status).toBe(401)
    expect((await login('owner@example.com', 'newsecret1')).status).toBe(200)
  })

  it.each(['k7qm 2xpa 9rtd 4wnb', 'K7QM2XPA9RTD4WNB'])('200: код «%s» — регистр и разделители не важны', async (code) => {
    expect((await recover(code)).status).toBe(200)
  })

  it.each([
    ['15', 'K7QM-2XPA-9RTD-4WN'],
    ['17', 'K7QM-2XPA-9RTD-4WNBX'],
  ])('422: %s символов после очистки — не код, попытка не считается', async (_length, code) => {
    const response = await recover(code)
    expect(response.status).toBe(422)
    expect(readServer().attempts).toEqual({})
  })
})

describe('временный пароль и смена пароля', () => {
  it('с временным паролем доступны только профиль и смена пароля', async () => {
    const token = await accessToken('clinic-new@example.com')
    const bell = await call('GET', '/notifications/unread-count', { token })
    expect(bell.status).toBe(403)
    expect(await bell.json()).toEqual({ detail: 'password_change_required' })
    const me = await call('GET', '/users/me', { token })
    expect(await me.json()).toMatchObject({ email: 'clinic-new@example.com', must_change_password: true })
  })

  it('смена пароля: 400 при неверном текущем, затем 200 и флаг сброшен', async () => {
    const token = await accessToken('clinic-new@example.com')
    const wrong = await call('POST', '/auth/change-password', {
      token,
      body: { current_password: 'wrong-pass', new_password: 'newsecret1' },
    })
    expect(wrong.status).toBe(400)

    const changed = await call('POST', '/auth/change-password', {
      token,
      body: { current_password: SEED_PASSWORD, new_password: 'newsecret1' },
    })
    expect(changed.status).toBe(200)
    const { access_token: fresh } = (await changed.json()) as { access_token: string }
    const me = await call('GET', '/users/me', { token: fresh })
    expect(await me.json()).toMatchObject({ must_change_password: false })
  })

  it('смена пароля без токена и с невалидным телом — 401, а не 422', async () => {
    expect((await call('POST', '/auth/change-password', { body: { current_password: 1 } })).status).toBe(401)
  })

  it('PATCH /users/me с временным паролем — 403 password_change_required, даже с невалидным телом', async () => {
    const token = await accessToken('clinic-new@example.com')
    const valid = await call('PATCH', '/users/me', { token, body: { full_name: 'Клиника' } })
    expect(valid.status).toBe(403)
    expect(await valid.json()).toEqual({ detail: 'password_change_required' })
    expect((await call('PATCH', '/users/me', { token, body: { full_name: 5 } })).status).toBe(403)
  })

  it('выход с временным паролем работает', async () => {
    await login('clinic-new@example.com')
    expect((await call('POST', '/auth/logout')).status).toBe(204)
    expect(readMockCookie()).toBeNull()
  })

  it('после смены пароля новая cookie обменивается, старая — нет', async () => {
    const token = await accessToken('clinic-new@example.com')
    const before = readMockCookie()
    const changed = await call('POST', '/auth/change-password', {
      token,
      body: { current_password: SEED_PASSWORD, new_password: 'newsecret1' },
    })
    expect(changed.status).toBe(200)
    expect(readMockCookie()).not.toBe(before)
    expect((await refresh()).status).toBe(200)
    writeMockCookie(before)
    expect((await refresh()).status).toBe(401)
  })
})

describe('профиль', () => {
  it('PATCH /users/me: имя обрезается, пустое — 422', async () => {
    const token = await accessToken('owner@example.com')
    const renamed = await call('PATCH', '/users/me', { token, body: { full_name: '  Анна Иванова ' } })
    expect(await renamed.json()).toMatchObject({ full_name: 'Анна Иванова', email: 'owner@example.com' })
    expect((await call('PATCH', '/users/me', { token, body: { full_name: '   ' } })).status).toBe(422)
  })

  it('PATCH /users/me клиникой — 403 даже с невалидным телом, имя не меняется (Р-35)', async () => {
    const token = await accessToken('clinic@example.com')
    const renamed = await call('PATCH', '/users/me', { token, body: { full_name: 'Другое имя' } })
    expect(renamed.status).toBe(403)
    expect(await renamed.json()).toEqual({ detail: 'Название клиники меняет администратор' })
    expect((await call('PATCH', '/users/me', { token, body: { full_name: 5 } })).status).toBe(403)
    expect(await (await call('GET', '/users/me', { token })).json()).toMatchObject({ full_name: 'ВетДоктор' })
  })

  it('новый код восстановления: только владелец и только с верным паролем', async () => {
    const owner = await accessToken('owner@example.com')
    expect(
      (await call('POST', '/users/me/recovery-code', { token: owner, body: { current_password: 'wrong-pass' } })).status,
    ).toBe(400)
    const issued = await call('POST', '/users/me/recovery-code', { token: owner, body: { current_password: SEED_PASSWORD } })
    expect(issued.status).toBe(200)
    expect((await issued.json()).recovery_code).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/)

    const clinic = await accessToken('clinic@example.com')
    expect(
      (await call('POST', '/users/me/recovery-code', { token: clinic, body: { current_password: SEED_PASSWORD } })).status,
    ).toBe(403)
  })
})

describe('счётчик попыток: смена пароля и новый код', () => {
  const changePassword = (token: string, current: string) =>
    call('POST', '/auth/change-password', { token, body: { current_password: current, new_password: 'newsecret1' } })
  const issueCode = (token: string, current: string) =>
    call('POST', '/users/me/recovery-code', { token, body: { current_password: current } })
  const ownerAccount = () => readServer().accounts.find((item) => item.email === 'owner@example.com')

  it('смена пароля: после 5 неверных текущих — 429 с Retry-After даже с верным, и вход тоже 429', async () => {
    const token = await accessToken('owner@example.com')
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await changePassword(token, 'wrong-pass')).status).toBe(400)
    }
    const locked = await changePassword(token, SEED_PASSWORD)
    expect(locked.status).toBe(429)
    expect(Number(locked.headers.get('Retry-After'))).toBeGreaterThanOrEqual(899)
    expect(ownerAccount()?.password).toBe(SEED_PASSWORD)
    // Тело проверяется раньше паузы: 422 и во время паузы.
    expect((await changePassword(token, 'x'.repeat(129))).status).toBe(422)
    expect((await login('owner@example.com')).status).toBe(429)
  })

  it('новый код: после 5 неверных паролей — 429 с Retry-After даже с верным, код прежний', async () => {
    const token = await accessToken('owner@example.com')
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await issueCode(token, 'wrong-pass')).status).toBe(400)
    }
    const locked = await issueCode(token, SEED_PASSWORD)
    expect(locked.status).toBe(429)
    expect(Number(locked.headers.get('Retry-After'))).toBeGreaterThanOrEqual(899)
    expect(ownerAccount()?.recovery_code).toBe('K7QM-2XPA-9RTD-4WNB')
  })

  it('счётчик общий с входом: 4 неудачи входа и неверный пароль при новом коде — пауза', async () => {
    const token = await accessToken('owner@example.com')
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await login('owner@example.com', 'wrong-pass')).status).toBe(401)
    }
    expect((await issueCode(token, 'wrong-pass')).status).toBe(400)
    expect((await changePassword(token, SEED_PASSWORD)).status).toBe(429)
  })

  it('верный пароль сбрасывает счётчик', async () => {
    const token = await accessToken('owner@example.com')
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await issueCode(token, 'wrong-pass')).status).toBe(400)
    }
    expect((await issueCode(token, SEED_PASSWORD)).status).toBe(200)
    expect(readServer().attempts).toEqual({})
  })

  it('422: текущий пароль длиннее 128 — попытка не считается', async () => {
    const token = await accessToken('owner@example.com')
    expect((await changePassword(token, 'x'.repeat(129))).status).toBe(422)
    expect((await issueCode(token, 'x'.repeat(129))).status).toBe(422)
    expect(readServer().attempts).toEqual({})
  })
})

describe('доступ и сеть', () => {
  it('заблокированный после входа — 403 на данных', async () => {
    const token = await accessToken('owner@example.com')
    updateServer((state) => {
      state.accounts.find((account) => account.id === 1)!.is_active = false
    })
    const response = await call('GET', '/pets', { token })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ detail: 'Аккаунт заблокирован' })
  })

  it('сеть выключена — запросы падают сетевой ошибкой', async () => {
    updateServer((state) => {
      state.network = false
    })
    await expect(call('GET', '/users/me')).rejects.toThrow()
  })
})

describe('лимиты полей (как у бэкенда)', () => {
  it('регистрация: все ошибки полей сразу, по-русски', async () => {
    const response = await register('not-an-email', '   ', 'x'.repeat(129))
    expect(response.status).toBe(422)
    const { detail } = (await response.json()) as { detail: { loc: string[]; msg: string }[] }
    expect(detail.map((item) => [item.loc[1], item.msg])).toEqual([
      ['email', 'Неверный формат email'],
      ['password', 'Пароль — не длиннее 128 символов'],
      ['full_name', 'Имя не может быть пустым'],
    ])
  })

  it('email длиннее 254 символов — 422', async () => {
    const response = await register(`${'a'.repeat(250)}@example.com`, 'Анна')
    expect(response.status).toBe(422)
  })

  it('имя: 100 символов можно, 101 — нет; эмодзи считается одним символом', async () => {
    expect((await register('a1@example.com', 'а'.repeat(100))).status).toBe(201)
    expect((await register('a2@example.com', 'а'.repeat(101))).status).toBe(422)
    expect((await register('a3@example.com', '😀'.repeat(100))).status).toBe(201)
  })

  it('имя с управляющим символом — 422; HTML сохраняется как текст', async () => {
    expect((await register('c1@example.com', 'Анна\u0000')).status).toBe(422)
    const html = await register('c2@example.com', '<script>alert(1)</script>')
    expect(html.status).toBe(201)
    expect((await html.json()).user.full_name).toBe('<script>alert(1)</script>')
  })

  it('пароль из пробелов и юникода принимается как есть', async () => {
    const response = await register('p1@example.com', 'Анна', '  пароль 🔑  ')
    expect(response.status).toBe(201)
    logoutMock()
    expect((await login('p1@example.com', '  пароль 🔑  ')).status).toBe(200)
  })

  it('вход: пароль длиннее 128 — 422 и попытка не считается', async () => {
    const response = await login('owner@example.com', 'x'.repeat(129))
    expect(response.status).toBe(422)
    expect(readServer().attempts).toEqual({})
  })

  it('восстановление: код не в формате — 422 и попытка не считается', async () => {
    const response = await recover('abc')
    expect(response.status).toBe(422)
    expect(readServer().attempts).toEqual({})
  })

  it('PATCH /users/me: имя длиннее 100 — 422, имя не меняется', async () => {
    const token = await accessToken('owner@example.com')
    expect((await call('PATCH', '/users/me', { token, body: { full_name: 'а'.repeat(101) } })).status).toBe(422)
    const me = await call('GET', '/users/me', { token })
    expect(await me.json()).toMatchObject({ full_name: 'Анна Смирнова' })
  })

  it('поле не строка или тело не JSON — 422, а не 500', async () => {
    expect((await call('POST', '/auth/login', { body: { email: 42, password: null } })).status).toBe(422)
    const broken = await call('POST', '/auth/login', { raw: 'не json' })
    expect(broken.status).toBe(422)
  })
})

describe('requireMockPasswordChange', () => {
  it('вошедшему аккаунту ставит временный пароль: данные — 403 password_change_required, профиль — 200', async () => {
    const token = await accessToken('clinic@example.com')
    expect((await call('GET', '/notifications/unread-count', { token })).status).toBe(200)
    requireMockPasswordChange()
    const bell = await call('GET', '/notifications/unread-count', { token })
    expect(bell.status).toBe(403)
    expect(await bell.json()).toEqual({ detail: 'password_change_required' })
    const me = await call('GET', '/users/me', { token })
    expect(me.status).toBe(200)
    expect(await me.json()).toMatchObject({ email: 'clinic@example.com', must_change_password: true })
  })

  it('без cookie — понятная ошибка', () => {
    logoutMock()
    expect(() => requireMockPasswordChange()).toThrow('Нет вошедшего аккаунта')
  })
})
