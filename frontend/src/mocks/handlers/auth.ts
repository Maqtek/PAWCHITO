import { delay, http, HttpResponse } from 'msw'
import { authLimits } from '../../api/limits'
import type {
  ChangePasswordRequest,
  LoginRequest,
  RecoverRequest,
  RecoveryCodeRequest,
  RegisterRequest,
  UserUpdate,
} from '../../api/schema'
import {
  emailError,
  fullNameError,
  maxLengthError,
  normalizeRecoveryCode,
  passwordError,
  recoveryCodeError,
} from '../auth-validation'
import {
  authorizeAccount,
  conflict,
  forbidden,
  readBody,
  tooManyRequests,
  unauthorized,
  validateBody,
} from '../http-utils'
import {
  attemptsKey,
  findAccount,
  issueRefreshToken,
  newRecoveryCode,
  readMockCookie,
  readServer,
  revokeUserTokens,
  tokenBody,
  toUser,
  updateServer,
  writeMockCookie,
  type MockAccount,
  type MockServerState,
} from '../server-state'

const MAX_FAILURES = 5
const LOCK_MS = 15 * 60_000

/**
 * Секунды до конца паузы после пяти неудач или null. Счётчик один на аккаунт: неверный пароль при входе,
 * неверный код восстановления и неверный текущий пароль при смене пароля и новом коде считаются вместе.
 */
function lockedFor(state: MockServerState, email: string): number | null {
  const lockedUntil = state.attempts[attemptsKey(email)]?.lockedUntil ?? null
  if (lockedUntil === null || lockedUntil <= Date.now()) return null
  return Math.ceil((lockedUntil - Date.now()) / 1000)
}

function registerFailure(state: MockServerState, email: string): void {
  const failures = (state.attempts[attemptsKey(email)]?.failures ?? 0) + 1
  state.attempts[attemptsKey(email)] =
    failures >= MAX_FAILURES ? { failures: 0, lockedUntil: Date.now() + LOCK_MS } : { failures, lockedUntil: null }
}

function clearFailures(state: MockServerState, email: string): void {
  delete state.attempts[attemptsKey(email)]
}

/** Новый refresh-токен в cookie и тело Token. */
function startSession(state: MockServerState, account: MockAccount) {
  writeMockCookie(issueRefreshToken(state, account.id))
  return tokenBody(state, account)
}

export const authHandlers = [
  http.post('*/api/auth/register', async ({ request }) => {
    const raw = await readBody(request)
    const invalid = validateBody({
      email: emailError(raw.email),
      password: passwordError(raw.password),
      full_name: fullNameError(raw.full_name),
    })
    if (invalid) return invalid
    const body = raw as RegisterRequest
    return updateServer((state) => {
      if (findAccount(state, body.email)) return conflict('Email уже зарегистрирован')
      const account: MockAccount = {
        id: state.nextUserId,
        email: body.email.trim(),
        password: body.password,
        role: 'owner',
        full_name: body.full_name.trim(),
        must_change_password: false,
        is_active: true,
        recovery_code: newRecoveryCode(),
        clinic_id: null,
      }
      state.nextUserId += 1
      state.accounts.push(account)
      return HttpResponse.json(
        { user: toUser(state, account), recovery_code: account.recovery_code, ...startSession(state, account) },
        { status: 201 },
      )
    })
  }),

  http.post('*/api/auth/login', async ({ request }) => {
    const raw = await readBody(request)
    // Длину проверяем до сверки пароля: огромные строки сервер не хеширует. 422 — не попытка входа.
    const invalid = validateBody({
      email: maxLengthError(raw.email, authLimits.emailMax, 'Email'),
      password: maxLengthError(raw.password, authLimits.passwordMax, 'Пароль'),
    })
    if (invalid) return invalid
    const body = raw as LoginRequest
    return updateServer((state) => {
      const retryAfter = lockedFor(state, body.email)
      if (retryAfter !== null) return tooManyRequests(retryAfter)
      const account = findAccount(state, body.email)
      if (!account || account.password !== body.password) {
        registerFailure(state, body.email)
        return HttpResponse.json({ detail: 'Неверный email или пароль' }, { status: 401 })
      }
      if (!account.is_active) return forbidden('Аккаунт заблокирован')
      clearFailures(state, body.email)
      return HttpResponse.json(startSession(state, account))
    })
  }),

  http.post('*/api/auth/refresh', async () => {
    // Cookie уходит в момент отправки, а сервер сверяет её позже — без очереди две вкладки предъявят одну.
    const presented = readMockCookie()
    const { refreshDelayMs } = readServer()
    if (refreshDelayMs > 0) await delay(refreshDelayMs)
    return updateServer((state) => {
      const record = presented === null ? undefined : state.refreshTokens[presented]
      if (!record) {
        writeMockCookie(null)
        return unauthorized()
      }
      if (record.revoked) {
        // БП §1: повторное предъявление отозванного токена отзывает все токены пользователя.
        revokeUserTokens(state, record.userId)
        writeMockCookie(null)
        return unauthorized()
      }
      record.revoked = true
      const account = state.accounts.find((item) => item.id === record.userId)
      if (!account?.is_active) {
        writeMockCookie(null)
        return unauthorized()
      }
      return HttpResponse.json(startSession(state, account))
    })
  }),

  http.post('*/api/auth/logout', () =>
    updateServer((state) => {
      const presented = readMockCookie()
      const record = presented === null ? undefined : state.refreshTokens[presented]
      if (record) record.revoked = true
      writeMockCookie(null)
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  http.post('*/api/auth/recover', async ({ request }) => {
    const raw = await readBody(request)
    const invalid = validateBody({
      email: maxLengthError(raw.email, authLimits.emailMax, 'Email'),
      recovery_code: recoveryCodeError(raw.recovery_code),
      new_password: passwordError(raw.new_password),
    })
    if (invalid) return invalid
    const body = raw as RecoverRequest
    return updateServer((state) => {
      const retryAfter = lockedFor(state, body.email)
      if (retryAfter !== null) return tooManyRequests(retryAfter)
      const account = findAccount(state, body.email)
      if (!account?.recovery_code || account.recovery_code !== normalizeRecoveryCode(body.recovery_code)) {
        registerFailure(state, body.email)
        return HttpResponse.json({ detail: 'Неверный email или код' }, { status: 400 })
      }
      clearFailures(state, body.email)
      account.password = body.new_password
      account.recovery_code = newRecoveryCode()
      revokeUserTokens(state, account.id)
      return HttpResponse.json({ recovery_code: account.recovery_code })
    })
  }),

  http.post('*/api/auth/change-password', async ({ request }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      // Как у FastAPI: сначала доступ, потом тело, потом сверка пароля.
      const account = authorizeAccount(state, request, { allowPasswordChange: true })
      if (account instanceof Response) return account
      const invalid = validateBody({
        current_password: maxLengthError(raw.current_password, authLimits.passwordMax, 'Пароль'),
        new_password: passwordError(raw.new_password),
      })
      if (invalid) return invalid
      const body = raw as ChangePasswordRequest
      // Пауза после тела: 422 попыткой не считается, а 429 — даже с верным паролем.
      const retryAfter = lockedFor(state, account.email)
      if (retryAfter !== null) return tooManyRequests(retryAfter)
      if (account.password !== body.current_password) {
        registerFailure(state, account.email)
        return HttpResponse.json({ detail: 'Неверный текущий пароль' }, { status: 400 })
      }
      clearFailures(state, account.email)
      account.password = body.new_password
      account.must_change_password = false
      revokeUserTokens(state, account.id)
      return HttpResponse.json(startSession(state, account))
    })
  }),

  http.get('*/api/users/me', ({ request }) => {
    const state = readServer()
    const account = authorizeAccount(state, request, { allowPasswordChange: true })
    return account instanceof Response ? account : HttpResponse.json(toUser(state, account))
  }),

  http.patch('*/api/users/me', async ({ request }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const account = authorizeAccount(state, request)
      if (account instanceof Response) return account
      // Имя клиники — её название, его меняет администратор (Р-35); тело не проверяется.
      if (account.role === 'clinic') return forbidden('Название клиники меняет администратор')
      const invalid = validateBody({ full_name: fullNameError(raw.full_name) })
      if (invalid) return invalid
      account.full_name = (raw as UserUpdate).full_name.trim()
      return HttpResponse.json(toUser(state, account))
    })
  }),

  http.post('*/api/users/me/recovery-code', async ({ request }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const account = authorizeAccount(state, request, { allowed: ['owner'] })
      if (account instanceof Response) return account
      const invalid = validateBody({
        current_password: maxLengthError(raw.current_password, authLimits.passwordMax, 'Пароль'),
      })
      if (invalid) return invalid
      const body = raw as RecoveryCodeRequest
      const retryAfter = lockedFor(state, account.email)
      if (retryAfter !== null) return tooManyRequests(retryAfter)
      if (account.password !== body.current_password) {
        registerFailure(state, account.email)
        return HttpResponse.json({ detail: 'Неверный текущий пароль' }, { status: 400 })
      }
      clearFailures(state, account.email)
      account.recovery_code = newRecoveryCode()
      return HttpResponse.json({ recovery_code: account.recovery_code })
    })
  }),
]
