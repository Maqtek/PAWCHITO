import { http, HttpResponse } from 'msw'
import type { ClinicAccountCreate, ClinicCreate, ClinicUpdate } from '../../api/schema'
import { emailError, readBody, validateBody } from '../auth-validation'
import {
  clinicAddressError,
  clinicNameError,
  closesError,
  phoneError,
  timeError,
  workDaysError,
} from '../clinic-validation'
import { authorizeAccount } from '../http-utils'
import {
  attemptsKey,
  findAccount,
  newTemporaryPassword,
  readServer,
  revokeUserTokens,
  toAdminClinic,
  toUser,
  updateServer,
  type MockAccount,
  type MockClinic,
  type MockServerState,
} from '../server-state'

const notFound = (detail = 'Клиника не найдена') => HttpResponse.json({ detail }, { status: 404 })

function findClinic(state: MockServerState, rawId: unknown): MockClinic | undefined {
  const id = Number(rawId)
  return state.clinics.find((clinic) => clinic.id === id)
}

const accountOf = (state: MockServerState, clinic: MockClinic) =>
  state.accounts.find((item) => item.clinic_id === clinic.id)

const sortedDays = (days: number[]) => [...days].sort((a, b) => a - b)

// Как у бэкенда: сначала доступ, потом тело (422), потом поиск клиники (404).
export const adminHandlers = [
  http.get('*/api/admin/clinics', ({ request }) => {
    const state = readServer()
    const account = authorizeAccount(state, request, { allowed: ['admin'] })
    if (account instanceof Response) return account
    return HttpResponse.json(state.clinics.map((clinic) => toAdminClinic(state, clinic)))
  }),

  http.post('*/api/admin/clinics', async ({ request }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const account = authorizeAccount(state, request, { allowed: ['admin'] })
      if (account instanceof Response) return account
      const opens = timeError(raw.opens_at, 'Открытие')
      const closes = timeError(raw.closes_at, 'Закрытие')
      const invalid = validateBody({
        name: clinicNameError(raw.name),
        address: clinicAddressError(raw.address),
        phone: phoneError(raw.phone),
        opens_at: opens,
        // Порядок часов — только у двух верных времён: «9:00» и «10:00» как строки сравниваются неверно.
        closes_at: opens || closes ? closes : closesError(raw.opens_at, raw.closes_at),
        work_days: workDaysError(raw.work_days),
      })
      if (invalid) return invalid
      const body = raw as ClinicCreate
      const clinic: MockClinic = {
        id: state.nextClinicId,
        name: body.name.trim(),
        address: body.address.trim(),
        phone: body.phone,
        opens_at: body.opens_at,
        closes_at: body.closes_at,
        work_days: sortedDays(body.work_days),
        archived_at: null,
        futureAppointments: 0,
      }
      state.nextClinicId += 1
      state.clinics.push(clinic)
      return HttpResponse.json(toAdminClinic(state, clinic), { status: 201 })
    })
  }),

  http.get('*/api/admin/clinics/:id', ({ request, params }) => {
    const state = readServer()
    const account = authorizeAccount(state, request, { allowed: ['admin'] })
    if (account instanceof Response) return account
    const clinic = findClinic(state, params.id)
    return clinic ? HttpResponse.json(toAdminClinic(state, clinic)) : notFound()
  }),

  http.patch('*/api/admin/clinics/:id', async ({ request, params }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const account = authorizeAccount(state, request, { allowed: ['admin'] })
      if (account instanceof Response) return account
      // Проверяются только присланные поля.
      const sent = (field: string) => field in raw
      const invalid = validateBody({
        name: sent('name') ? clinicNameError(raw.name) : null,
        address: sent('address') ? clinicAddressError(raw.address) : null,
        phone: sent('phone') ? phoneError(raw.phone) : null,
        opens_at: sent('opens_at') ? timeError(raw.opens_at, 'Открытие') : null,
        closes_at: sent('closes_at') ? timeError(raw.closes_at, 'Закрытие') : null,
        work_days: sent('work_days') ? workDaysError(raw.work_days) : null,
      })
      if (invalid) return invalid
      const clinic = findClinic(state, params.id)
      if (!clinic) return notFound()
      const body = raw as ClinicUpdate
      // Открытие раньше закрытия — по итоговым значениям: новое + сохранённое.
      const order = validateBody({
        closes_at: closesError(body.opens_at ?? clinic.opens_at, body.closes_at ?? clinic.closes_at),
      })
      if (order) return order
      if (body.name !== undefined) clinic.name = body.name.trim()
      if (body.address !== undefined) clinic.address = body.address.trim()
      if (body.phone !== undefined) clinic.phone = body.phone
      if (body.opens_at !== undefined) clinic.opens_at = body.opens_at
      if (body.closes_at !== undefined) clinic.closes_at = body.closes_at
      if (body.work_days !== undefined) clinic.work_days = sortedDays(body.work_days)
      return HttpResponse.json(toAdminClinic(state, clinic))
    })
  }),

  http.post('*/api/admin/clinics/:id/archive', ({ request, params }) =>
    updateServer((state) => {
      const account = authorizeAccount(state, request, { allowed: ['admin'] })
      if (account instanceof Response) return account
      const clinic = findClinic(state, params.id)
      if (!clinic) return notFound()
      // Повторное скрытие ничего не отменяет второй раз.
      if (clinic.archived_at !== null) {
        return HttpResponse.json({ clinic: toAdminClinic(state, clinic), cancelled_appointments: 0 })
      }
      const cancelled = clinic.futureAppointments
      clinic.archived_at = new Date().toISOString()
      clinic.futureAppointments = 0
      const clinicAccount = accountOf(state, clinic)
      if (clinicAccount) {
        clinicAccount.is_active = false
        revokeUserTokens(state, clinicAccount.id)
      }
      return HttpResponse.json({ clinic: toAdminClinic(state, clinic), cancelled_appointments: cancelled })
    }),
  ),

  http.post('*/api/admin/clinics/:id/restore', ({ request, params }) =>
    updateServer((state) => {
      const account = authorizeAccount(state, request, { allowed: ['admin'] })
      if (account instanceof Response) return account
      const clinic = findClinic(state, params.id)
      if (!clinic) return notFound()
      clinic.archived_at = null
      const clinicAccount = accountOf(state, clinic)
      if (clinicAccount) clinicAccount.is_active = true
      return HttpResponse.json(toAdminClinic(state, clinic))
    }),
  ),

  http.post('*/api/admin/clinics/:id/account', async ({ request, params }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const account = authorizeAccount(state, request, { allowed: ['admin'] })
      if (account instanceof Response) return account
      const invalid = validateBody({ email: emailError(raw.email) })
      if (invalid) return invalid
      const clinic = findClinic(state, params.id)
      if (!clinic) return notFound()
      const email = (raw as ClinicAccountCreate).email.trim()
      if (accountOf(state, clinic) || findAccount(state, email)) {
        return HttpResponse.json({ detail: 'У клиники уже есть аккаунт или email занят' }, { status: 409 })
      }
      const temporaryPassword = newTemporaryPassword()
      const created: MockAccount = {
        id: state.nextUserId,
        email,
        password: temporaryPassword,
        role: 'clinic',
        // Имя не копируется: toUser берёт название клиники при каждом ответе (Р-35).
        full_name: '',
        must_change_password: true,
        // Аккаунт скрытой клиники сразу заблокирован, как после скрытия.
        is_active: clinic.archived_at === null,
        recovery_code: null,
        clinic_id: clinic.id,
      }
      state.nextUserId += 1
      state.accounts.push(created)
      return HttpResponse.json({ user: toUser(state, created), temporary_password: temporaryPassword }, { status: 201 })
    })
  }),

  http.post('*/api/admin/clinics/:id/account/reset-password', ({ request, params }) =>
    updateServer((state) => {
      const account = authorizeAccount(state, request, { allowed: ['admin'] })
      if (account instanceof Response) return account
      const clinic = findClinic(state, params.id)
      if (!clinic) return notFound()
      const clinicAccount = accountOf(state, clinic)
      if (!clinicAccount) return notFound('У клиники нет аккаунта')
      const temporaryPassword = newTemporaryPassword()
      clinicAccount.password = temporaryPassword
      clinicAccount.must_change_password = true
      revokeUserTokens(state, clinicAccount.id)
      // Пауза после неудачных попыток снимается: клиника войдёт с новым временным паролем сразу.
      delete state.attempts[attemptsKey(clinicAccount.email)]
      return HttpResponse.json({ temporary_password: temporaryPassword })
    }),
  ),
]
