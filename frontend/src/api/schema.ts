/**
 * Типы API, написанные вручную по docs/Контракты_Pawchito.md (v1.6).
 * `paths` и `components` повторяют формат openapi-typescript: когда бэкенд отдаст
 * openapi.json, эти два интерфейса заменяются сгенерированными, а псевдонимы
 * типов внизу файла переезжают в отдельный модуль поверх сгенерированного.
 * Здесь только эндпоинты, которые уже использует фронт.
 */

type Json<T> = { headers: { [name: string]: unknown }; content: { 'application/json': T } }
type NoContent = { headers: { [name: string]: unknown }; content?: never }
type NoParams = { query?: never; header?: never; path?: never; cookie?: never }
type ClinicPath = { query?: never; header?: never; path: { id: number }; cookie?: never }
type VetPath = { query?: never; header?: never; path: { id: number }; cookie?: never }
type PetPath = { query?: never; header?: never; path: { pet_id: number }; cookie?: never }
/** Запись здоровья питомца: особенность, наблюдение или прививка. */
type PetRecordPath = { query?: never; header?: never; path: { pet_id: number; id: number }; cookie?: never }
type Body<T> = { content: { 'application/json': T } }

export interface components {
  schemas: {
    Role: 'owner' | 'clinic' | 'admin'
    Species: 'dog' | 'cat' | 'other'
    Sex: 'male' | 'female' | 'unknown'
    ConditionKind: 'allergy' | 'chronic'
    /** Аппетит и энергия в дневнике. */
    Level: 'low' | 'normal' | 'high'
    /** Кто внёс запись здоровья: владелец или клиника. */
    DataSource: 'owner' | 'clinic'
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
    /** sex можно не передавать — сервер поставит unknown (Р-41). */
    PetCreate: {
      name: string
      species: components['schemas']['Species']
      breed?: string | null
      birth_date?: string | null
      sex?: components['schemas']['Sex']
    }
    /** null в breed и birth_date убирает значение, в name, species и sex — 422 (Р-41). */
    PetUpdate: {
      name?: string
      species?: components['schemas']['Species']
      breed?: string | null
      birth_date?: string | null
      sex?: components['schemas']['Sex']
    }
    PetArchived: { pet: components['schemas']['Pet']; cancelled_appointments: number; deleted_reminders: number }
    /** Особенность здоровья; description: null — комментария нет (Р-44). */
    Condition: {
      id: number
      pet_id: number
      kind: components['schemas']['ConditionKind']
      title: string
      description: string | null
      source: components['schemas']['DataSource']
      archived_at: string | null
    }
    ConditionCreate: { kind: components['schemas']['ConditionKind']; title: string; description?: string | null }
    /** null в description убирает комментарий, в kind и title — 422. */
    ConditionUpdate: { kind?: components['schemas']['ConditionKind']; title?: string; description?: string | null }
    /** Наблюдение дневника: любое поле, кроме date, может быть null, но хотя бы одно заполнено (Р-45). Вес — в кг. */
    Observation: {
      id: number
      pet_id: number
      /** YYYY-MM-DD */
      date: string
      weight: number | null
      appetite: components['schemas']['Level'] | null
      energy: components['schemas']['Level'] | null
      symptoms: string | null
      note: string | null
      source: components['schemas']['DataSource']
    }
    ObservationCreate: {
      date: string
      weight?: number | null
      appetite?: components['schemas']['Level'] | null
      energy?: components['schemas']['Level'] | null
      symptoms?: string | null
      note?: string | null
    }
    /** null в date — 422, в остальных полях — убрать значение (Р-43). */
    ObservationUpdate: Partial<components['schemas']['ObservationCreate']>
    /** Прививка; next_date: null — следующая не запланирована; appointment_id — приём клиники, у владельца — null. */
    Vaccination: {
      id: number
      pet_id: number
      name: string
      /** YYYY-MM-DD */
      date: string
      next_date: string | null
      source: components['schemas']['DataSource']
      appointment_id: number | null
    }
    VaccinationCreate: { name: string; date: string; next_date?: string | null }
    /** null в next_date убирает следующую прививку, в name и date — 422 (Р-46). */
    VaccinationUpdate: { name?: string; date?: string; next_date?: string | null }
    /** Клиника: часы ЧЧ:ММ одинаковы для всех рабочих дней; work_days — 1 (понедельник) … 7 (воскресенье). */
    Clinic: {
      id: number
      name: string
      address: string
      phone: string
      opens_at: string
      closes_at: string
      work_days: number[]
    }
    ClinicAccount: { id: number; email: string; is_active: boolean }
    AdminClinic: components['schemas']['Clinic'] & {
      archived_at: string | null
      account: components['schemas']['ClinicAccount'] | null
      /** Показывается перед скрытием: столько записей будет отменено. */
      future_appointments_count: number
    }
    ClinicCreate: Omit<components['schemas']['Clinic'], 'id'>
    ClinicUpdate: Partial<components['schemas']['ClinicCreate']>
    ClinicAccountCreate: { email: string }
    ClinicAccountCreated: { user: components['schemas']['User']; temporary_password: string }
    TemporaryPassword: { temporary_password: string }
    ClinicArchived: { clinic: components['schemas']['AdminClinic']; cancelled_appointments: number }
    /** Врач клиники: отпуск — флаг без дат (Р-37); specialization: null — не указана. */
    Vet: {
      id: number
      clinic_id: number
      full_name: string
      specialization: string | null
      on_vacation: boolean
      archived_at: string | null
    }
    VetCreate: { full_name: string; specialization?: string | null }
    /** null в specialization убирает специализацию, в full_name и on_vacation — 422 (Р-38). */
    VetUpdate: { full_name?: string; specialization?: string | null; on_vacation?: boolean }
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
    post: {
      parameters: NoParams
      requestBody: Body<Schemas['PetCreate']>
      responses: {
        201: Json<Schemas['Pet']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/pets/{pet_id}': {
    parameters: PetPath
    get: {
      parameters: PetPath
      requestBody?: never
      responses: {
        200: Json<Schemas['Pet']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
      }
    }
    patch: {
      parameters: PetPath
      requestBody: Body<Schemas['PetUpdate']>
      responses: {
        200: Json<Schemas['Pet']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/pets/{pet_id}/archive': {
    parameters: PetPath
    post: {
      parameters: PetPath
      requestBody?: never
      responses: {
        200: Json<Schemas['PetArchived']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
      }
    }
  }
  '/pets/{pet_id}/conditions': {
    parameters: PetPath
    get: {
      parameters: PetPath
      requestBody?: never
      responses: {
        200: Json<Schemas['Condition'][]>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
      }
    }
    post: {
      parameters: PetPath
      requestBody: Body<Schemas['ConditionCreate']>
      responses: {
        201: Json<Schemas['Condition']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/pets/{pet_id}/conditions/{id}': {
    parameters: PetRecordPath
    patch: {
      parameters: PetRecordPath
      requestBody: Body<Schemas['ConditionUpdate']>
      responses: {
        200: Json<Schemas['Condition']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/pets/{pet_id}/conditions/{id}/archive': {
    parameters: PetRecordPath
    post: {
      parameters: PetRecordPath
      requestBody?: never
      responses: {
        200: Json<Schemas['Condition']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
      }
    }
  }
  '/pets/{pet_id}/observations': {
    parameters: PetPath
    get: {
      parameters: {
        query?: { date_from?: string; date_to?: string }
        header?: never
        path: { pet_id: number }
        cookie?: never
      }
      requestBody?: never
      responses: {
        200: Json<Schemas['Observation'][]>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
    post: {
      parameters: PetPath
      requestBody: Body<Schemas['ObservationCreate']>
      responses: {
        201: Json<Schemas['Observation']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/pets/{pet_id}/observations/{id}': {
    parameters: PetRecordPath
    patch: {
      parameters: PetRecordPath
      requestBody: Body<Schemas['ObservationUpdate']>
      responses: {
        200: Json<Schemas['Observation']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/pets/{pet_id}/vaccinations': {
    parameters: PetPath
    get: {
      parameters: PetPath
      requestBody?: never
      responses: {
        200: Json<Schemas['Vaccination'][]>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
      }
    }
    post: {
      parameters: PetPath
      requestBody: Body<Schemas['VaccinationCreate']>
      responses: {
        201: Json<Schemas['Vaccination']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/pets/{pet_id}/vaccinations/{id}': {
    parameters: PetRecordPath
    patch: {
      parameters: PetRecordPath
      requestBody: Body<Schemas['VaccinationUpdate']>
      responses: {
        200: Json<Schemas['Vaccination']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
    delete: {
      parameters: PetRecordPath
      requestBody?: never
      responses: {
        204: NoContent
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
      }
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
  '/admin/clinics': {
    parameters: NoParams
    get: {
      parameters: NoParams
      requestBody?: never
      responses: { 200: Json<Schemas['AdminClinic'][]>; 401: Json<Schemas['Error']>; 403: Json<Schemas['Error']> }
    }
    post: {
      parameters: NoParams
      requestBody: Body<Schemas['ClinicCreate']>
      responses: {
        201: Json<Schemas['AdminClinic']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/admin/clinics/{id}': {
    parameters: ClinicPath
    get: {
      parameters: ClinicPath
      requestBody?: never
      responses: {
        200: Json<Schemas['AdminClinic']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
      }
    }
    patch: {
      parameters: ClinicPath
      requestBody: Body<Schemas['ClinicUpdate']>
      responses: {
        200: Json<Schemas['AdminClinic']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/admin/clinics/{id}/archive': {
    parameters: ClinicPath
    post: {
      parameters: ClinicPath
      requestBody?: never
      responses: {
        200: Json<Schemas['ClinicArchived']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
      }
    }
  }
  '/admin/clinics/{id}/restore': {
    parameters: ClinicPath
    post: {
      parameters: ClinicPath
      requestBody?: never
      responses: {
        200: Json<Schemas['AdminClinic']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
      }
    }
  }
  '/admin/clinics/{id}/account': {
    parameters: ClinicPath
    post: {
      parameters: ClinicPath
      requestBody: Body<Schemas['ClinicAccountCreate']>
      responses: {
        201: Json<Schemas['ClinicAccountCreated']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        409: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/clinic/vets': {
    parameters: NoParams
    get: {
      parameters: { query?: { include_archived?: boolean }; header?: never; path?: never; cookie?: never }
      requestBody?: never
      responses: { 200: Json<Schemas['Vet'][]>; 401: Json<Schemas['Error']>; 403: Json<Schemas['Error']> }
    }
    post: {
      parameters: NoParams
      requestBody: Body<Schemas['VetCreate']>
      responses: {
        201: Json<Schemas['Vet']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/clinic/vets/{id}': {
    parameters: VetPath
    patch: {
      parameters: VetPath
      requestBody: Body<Schemas['VetUpdate']>
      responses: {
        200: Json<Schemas['Vet']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/clinic/vets/{id}/archive': {
    parameters: VetPath
    post: {
      parameters: VetPath
      requestBody?: never
      responses: {
        200: Json<Schemas['Vet']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
      }
    }
  }
  '/clinic/vets/{id}/restore': {
    parameters: VetPath
    post: {
      parameters: VetPath
      requestBody?: never
      responses: {
        200: Json<Schemas['Vet']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
      }
    }
  }
  '/admin/clinics/{id}/account/reset-password': {
    parameters: ClinicPath
    post: {
      parameters: ClinicPath
      requestBody?: never
      responses: {
        200: Json<Schemas['TemporaryPassword']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
      }
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
export type PetCreate = Schemas['PetCreate']
export type PetUpdate = Schemas['PetUpdate']
export type PetArchived = Schemas['PetArchived']
export type ConditionKind = Schemas['ConditionKind']
export type Level = Schemas['Level']
export type DataSource = Schemas['DataSource']
export type Condition = Schemas['Condition']
export type ConditionCreate = Schemas['ConditionCreate']
export type ConditionUpdate = Schemas['ConditionUpdate']
export type Observation = Schemas['Observation']
export type ObservationCreate = Schemas['ObservationCreate']
export type ObservationUpdate = Schemas['ObservationUpdate']
export type Vaccination = Schemas['Vaccination']
export type VaccinationCreate = Schemas['VaccinationCreate']
export type VaccinationUpdate = Schemas['VaccinationUpdate']
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
export type Clinic = Schemas['Clinic']
export type ClinicAccount = Schemas['ClinicAccount']
export type AdminClinic = Schemas['AdminClinic']
export type ClinicCreate = Schemas['ClinicCreate']
export type ClinicUpdate = Schemas['ClinicUpdate']
export type ClinicAccountCreate = Schemas['ClinicAccountCreate']
export type ClinicAccountCreated = Schemas['ClinicAccountCreated']
export type TemporaryPassword = Schemas['TemporaryPassword']
export type ClinicArchived = Schemas['ClinicArchived']
export type Vet = Schemas['Vet']
export type VetCreate = Schemas['VetCreate']
export type VetUpdate = Schemas['VetUpdate']
