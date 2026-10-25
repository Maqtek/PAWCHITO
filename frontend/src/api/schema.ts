/**
 * Типы API, написанные вручную по docs/Контракты_Pawchito.md (v1.1).
 * `paths` и `components` повторяют формат openapi-typescript: когда бэкенд отдаст
 * openapi.json, эти два интерфейса заменяются сгенерированными, а псевдонимы
 * типов внизу файла переезжают в отдельный модуль поверх сгенерированного.
 * Здесь только эндпоинты, которые уже использует фронт.
 */

type Json<T> = { headers: { [name: string]: unknown }; content: { 'application/json': T } }
type NoContent = { headers: { [name: string]: unknown }; content?: never }
type NoParams = { query?: never; header?: never; path?: never; cookie?: never }
type Body<T> = { content: { 'application/json': T } }

export interface components {
  schemas: {
    Role: 'owner' | 'clinic' | 'admin'
    Species: 'dog' | 'cat' | 'other'
    Sex: 'male' | 'female' | 'unknown'
    CareStatus: 'routine' | 'attention' | 'treatment' | 'recovery' | 'prevention'
    EventCategory: 'treatment' | 'routine' | 'prevention'
    AppointmentStatus: 'requested' | 'confirmed' | 'completed' | 'cancelled'
    User: {
      id: number
      email: string
      role: components['schemas']['Role']
      full_name: string
      must_change_password: boolean
    }
    Token: { access_token: string; token_type: 'bearer'; expires_in: number }
    LoginRequest: { email: string; password: string }
    RegisterRequest: { email: string; password: string; full_name: string }
    RegisterResponse: components['schemas']['Token'] & {
      user: components['schemas']['User']
      /** Показывается один раз, формат XXXX-XXXX-XXXX-XXXX. */
      recovery_code: string
    }
    RecoverRequest: { email: string; recovery_code: string; new_password: string }
    RecoveryCode: { recovery_code: string }
    ChangePasswordRequest: { current_password: string; new_password: string }
    UserUpdate: { full_name: string }
    RecoveryCodeRequest: { current_password: string }
    ClinicRef: { id: number; name: string }
    Pet: {
      id: number
      owner_id: number
      name: string
      species: components['schemas']['Species']
      breed: string | null
      /** YYYY-MM-DD */
      birth_date: string | null
      sex: components['schemas']['Sex']
      photo_url: string | null
      care_status: components['schemas']['CareStatus'] | null
      care_status_set_at: string | null
      care_status_clinic: components['schemas']['ClinicRef'] | null
      archived_at: string | null
    }
    UnreadCount: { unread_count: number }
    Error: { detail: string }
    /** Ошибка поля в ответе 422 (формат FastAPI). */
    ValidationError: { loc: (string | number)[]; msg: string; type: string }
    HTTPValidationError: { detail: components['schemas']['ValidationError'][] }
  }
}

type Schemas = components['schemas']

export interface paths {
  '/auth/register': {
    parameters: NoParams
    post: {
      parameters: NoParams
      requestBody: Body<Schemas['RegisterRequest']>
      responses: {
        201: Json<Schemas['RegisterResponse']>
        409: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/auth/login': {
    parameters: NoParams
    post: {
      parameters: NoParams
      requestBody: Body<Schemas['LoginRequest']>
      responses: {
        200: Json<Schemas['Token']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
        429: Json<Schemas['Error']>
      }
    }
  }
  '/auth/refresh': {
    parameters: NoParams
    post: {
      parameters: NoParams
      requestBody?: never
      responses: { 200: Json<Schemas['Token']>; 401: Json<Schemas['Error']> }
    }
  }
  '/auth/logout': {
    parameters: NoParams
    post: {
      parameters: NoParams
      requestBody?: never
      responses: { 204: NoContent }
    }
  }
  '/auth/recover': {
    parameters: NoParams
    post: {
      parameters: NoParams
      requestBody: Body<Schemas['RecoverRequest']>
      responses: {
        200: Json<Schemas['RecoveryCode']>
        400: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
        429: Json<Schemas['Error']>
      }
    }
  }
  '/auth/change-password': {
    parameters: NoParams
    post: {
      parameters: NoParams
      requestBody: Body<Schemas['ChangePasswordRequest']>
      responses: {
        200: Json<Schemas['Token']>
        400: Json<Schemas['Error']>
        401: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/users/me': {
    parameters: NoParams
    get: {
      parameters: NoParams
      requestBody?: never
      responses: { 200: Json<Schemas['User']>; 401: Json<Schemas['Error']>; 403: Json<Schemas['Error']> }
    }
    patch: {
      parameters: NoParams
      requestBody: Body<Schemas['UserUpdate']>
      responses: {
        200: Json<Schemas['User']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/users/me/recovery-code': {
    parameters: NoParams
    post: {
      parameters: NoParams
      requestBody: Body<Schemas['RecoveryCodeRequest']>
      responses: {
        200: Json<Schemas['RecoveryCode']>
        400: Json<Schemas['Error']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/pets': {
    parameters: NoParams
    get: {
      parameters: { query?: { archived?: boolean }; header?: never; path?: never; cookie?: never }
      requestBody?: never
      responses: { 200: Json<Schemas['Pet'][]>; 401: Json<Schemas['Error']>; 403: Json<Schemas['Error']> }
    }
  }
  '/notifications/unread-count': {
    parameters: NoParams
    get: {
      parameters: NoParams
      requestBody?: never
      responses: { 200: Json<Schemas['UnreadCount']>; 401: Json<Schemas['Error']>; 403: Json<Schemas['Error']> }
    }
  }
}

export type Role = Schemas['Role']
export type Species = Schemas['Species']
export type Sex = Schemas['Sex']
export type CareStatus = Schemas['CareStatus']
export type EventCategory = Schemas['EventCategory']
export type AppointmentStatus = Schemas['AppointmentStatus']
export type User = Schemas['User']
export type Token = Schemas['Token']
export type ClinicRef = Schemas['ClinicRef']
export type Pet = Schemas['Pet']
export type UnreadCount = Schemas['UnreadCount']
export type ApiErrorBody = Schemas['Error']
export type LoginRequest = Schemas['LoginRequest']
export type RegisterRequest = Schemas['RegisterRequest']
export type RegisterResponse = Schemas['RegisterResponse']
export type RecoverRequest = Schemas['RecoverRequest']
export type RecoveryCode = Schemas['RecoveryCode']
export type ChangePasswordRequest = Schemas['ChangePasswordRequest']
export type UserUpdate = Schemas['UserUpdate']
export type RecoveryCodeRequest = Schemas['RecoveryCodeRequest']
export type ValidationError = Schemas['ValidationError']
export type HTTPValidationError = Schemas['HTTPValidationError']
