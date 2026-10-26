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
import { authorizeOwner } from '../access'
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
  clearFailures,
  findAccount,
  findRefreshRecord,
  issueRefreshToken,
  lockedFor,
  newAccount,
  newRecoveryCode,
  readMockCookie,
  readServer,
  registerFailure,
  revokeUserTokens,
  tokenBody,
  toUser,
  updateServer,
  writeMockCookie,
  type MockAccount,
  type MockServerState,
} from '../server-state'

/** Новый refresh-токен в cookie и тело Token. */
function startSession(state: MockServerState, account: MockAccount) {
  writeMockCookie(issueRefreshToken(state, account.id))
  return tokenBody(state, account)
}

/** Refresh не принят: cookie стирается, ответ 401. */
function rejectRefresh(): Response {
  writeMockCookie(null)
  return unauthorized()
}

/**
 * Сверка текущего пароля — после проверки тела: 422 попыткой не считается, а 429 — даже с верным паролем.
 * Ответ 429 или 400, null — пароль верный.
 */
function currentPasswordError(state: MockServerState, account: MockAccount, password: string): Response | null {
  const retryAfter = lockedFor(state, account.email)
  if (retryAfter !== null) return tooManyRequests(retryAfter)
  if (account.password !== password) {
    registerFailure(state, account.email)
    return HttpResponse.json({ detail: 'Неверный текущий пароль' }, { status: 400 })
  }
  clearFailures(state, account.email)
  return null
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
      const account = newAccount({
        id: state.nextUserId,
        email: body.email.trim(),
        password: body.password,
        role: 'owner',
        full_name: body.full_name.trim(),
        recovery_code: newRecoveryCode(),
      })
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
      const record = findRefreshRecord(state, presented)
      if (!record) return rejectRefresh()
      if (record.revoked) {
        // БП §1: повторное предъявление отозванного токена отзывает все токены пользователя.
        revokeUserTokens(state, record.userId)
        return rejectRefresh()
      }
      record.revoked = true
      const account = state.accounts.find((item) => item.id === record.userId)
      if (!account?.is_active) return rejectRefresh()
      return HttpResponse.json(startSession(state, account))
    })
  }),

  http.post('*/api/auth/logout', () =>
    updateServer((state) => {
      const record = findRefreshRecord(state, readMockCookie())
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
      const wrongPassword = currentPasswordError(state, account, body.current_password)
      if (wrongPassword) return wrongPassword
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
      const account = authorizeOwner(state, request)
      if (account instanceof Response) return account
      const invalid = validateBody({
        current_password: maxLengthError(raw.current_password, authLimits.passwordMax, 'Пароль'),
      })
      if (invalid) return invalid
      const body = raw as RecoveryCodeRequest
      const wrongPassword = currentPasswordError(state, account, body.current_password)
      if (wrongPassword) return wrongPassword
      account.recovery_code = newRecoveryCode()
      return HttpResponse.json({ recovery_code: account.recovery_code })
    })
  }),
]
