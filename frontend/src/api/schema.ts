/**
 * Типы API, написанные вручную по docs/Контракты_Pawchito.md (v1.1).
 * Формат повторяет вывод openapi-typescript: когда бэкенд отдаст openapi.json,
 * файл заменяется сгенерированным без правок остального кода.
 * Здесь только эндпоинты, которые уже использует фронт.
 */

type Json<T> = { headers: { [name: string]: unknown }; content: { 'application/json': T } }
type NoContent = { headers: { [name: string]: unknown }; content?: never }
type NoParams = { query?: never; header?: never; path?: never; cookie?: never }

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
  }
}

type Schemas = components['schemas']

export interface paths {
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
  '/users/me': {
    parameters: NoParams
    get: {
      parameters: NoParams
      requestBody?: never
      responses: { 200: Json<Schemas['User']>; 401: Json<Schemas['Error']> }
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
