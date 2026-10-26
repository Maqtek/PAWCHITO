/**
 * Типы API, написанные вручную по docs/Контракты_Pawchito.md (v1.10).
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
type AppointmentPath = { query?: never; header?: never; path: { id: number }; cookie?: never }
type ReminderPath = { query?: never; header?: never; path: { id: number }; cookie?: never }
type PrescriptionPath = { query?: never; header?: never; path: { id: number }; cookie?: never }
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
    /** Причина обращения: задаёт тип события в календаре (БП §5). */
    AppointmentReason: 'checkup' | 'vaccination' | 'illness' | 'follow_up' | 'other'
    CancelledBy: 'owner' | 'clinic' | 'system'
    ReminderSource: 'prescription' | 'custom'
    ReminderStatus: 'pending' | 'done' | 'skipped'
    /** События из БП §9; перенос (расш.) и итог с изменением данных — этапы 9 и 13. */
    NotificationType:
      | 'appointment_requested'
      | 'appointment_cancelled_by_owner'
      | 'appointment_cancelled_pet_archived'
      | 'appointment_confirmed'
      | 'appointment_cancelled_by_clinic'
      | 'appointment_cancelled_clinic_unavailable'
      | 'outcome_added'
      | 'pet_updated_by_clinic'
      | 'appointment_rescheduled'
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
    /** Слот врача — 30 минут, время со смещением +03:00. */
    Slot: { slot_start: string; slot_end: string }
    PetRef: { id: number; name: string }
    VetRef: { id: number; full_name: string }
    Prescription: {
      id: number
      drug: string
      dosage: string
      /** ЧЧ:ММ приёмов в день. */
      times: string[]
      duration_days: number
      /** YYYY-MM-DD */
      start_date: string
    }
    /** Итог приёма — только у завершённой записи; форма итога — этап 9. */
    AppointmentOutcome: {
      conclusion: string
      recommendations: string | null
      care_status: components['schemas']['CareStatus']
      completed_at: string
      prescriptions: components['schemas']['Prescription'][]
      vaccinations: components['schemas']['Vaccination'][]
    }
    Appointment: {
      id: number
      pet: components['schemas']['PetRef']
      clinic: components['schemas']['ClinicRef']
      vet: components['schemas']['VetRef']
      slot_start: string
      slot_end: string
      reason: components['schemas']['AppointmentReason']
      reason_comment: string | null
      status: components['schemas']['AppointmentStatus']
      cancelled_by: components['schemas']['CancelledBy'] | null
      /** Комментарий клиники владельцу, например причина отмены. */
      clinic_comment: string | null
      outcome: components['schemas']['AppointmentOutcome'] | null
    }
    /** Клиника — по врачу, поэтому clinic_id не передаётся (Р-50). */
    AppointmentCreate: {
      pet_id: number
      vet_id: number
      slot_start: string
      reason: components['schemas']['AppointmentReason']
      reason_comment?: string | null
    }
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
    /** Текст собирает сервер, link — путь во фронте (Р-55). */
    Notification: {
      id: number
      type: components['schemas']['NotificationType']
      text: string
      link: string
      created_at: string
      read_at: string | null
    }
    NotificationList: { unread_count: number; items: components['schemas']['Notification'][] }
    ClinicAppointmentCancel: { comment: string }
    /** Карточка питомца для клиники (Р-54). */
    ClinicPetCard: {
      pet: components['schemas']['Pet']
      conditions: components['schemas']['Condition'][]
      vaccinations: components['schemas']['Vaccination'][]
      appointments: components['schemas']['Appointment'][]
    }
    /** start_date можно не передавать — день приёма (Р-56). */
    PrescriptionCreate: { drug: string; dosage: string; times: string[]; duration_days: number; start_date?: string }
    /** Данные питомца в итоге: вес — наблюдение клиники на день приёма (Р-56). */
    PetUpdateByClinic: {
      weight?: number
      breed?: string | null
      birth_date?: string | null
      sex?: components['schemas']['Sex']
    }
    /** Итог приёма — одной транзакцией (БП §6.1). */
    OutcomeCreate: {
      conclusion: string
      recommendations?: string | null
      care_status: components['schemas']['CareStatus']
      prescriptions?: components['schemas']['PrescriptionCreate'][]
      vaccinations?: components['schemas']['VaccinationCreate'][]
      pet_update?: components['schemas']['PetUpdateByClinic']
      conditions?: components['schemas']['ConditionCreate'][]
    }
    OutcomeResult: { appointment: components['schemas']['Appointment']; created_reminders: number }
    /** Клиника меняет только породу, дату рождения и пол (Р-57). */
    ClinicPetUpdate: { breed?: string | null; birth_date?: string | null; sex?: components['schemas']['Sex'] }
    WeightCreate: { date: string; weight: number }
    PetPhoto: { photo_url: string }
    /** Дело: курса (по рецепту) или своё. `is_overdue` — «Запланировано», а `due_at` прошло (Р-60). */
    Reminder: {
      id: number
      pet_id: number
      source: components['schemas']['ReminderSource']
      prescription_id: number | null
      title: string
      category: components['schemas']['EventCategory']
      due_at: string
      status: components['schemas']['ReminderStatus']
      is_overdue: boolean
      /** Время отметки — и выполнения, и пропуска (Р-61). */
      done_at: string | null
      repeat_interval_days: number | null
      /** id первого дела серии у своего дела с повтором, иначе null. */
      series_id: number | null
    }
    ReminderCreate: {
      pet_id: number
      title: string
      due_at: string
      category?: components['schemas']['EventCategory']
      repeat_interval_days?: number | null
    }
    /** next — следующее дело серии; у разового дела и дела курса — null. */
    ReminderMarked: { reminder: components['schemas']['Reminder']; next: components['schemas']['Reminder'] | null }
    PrescriptionProgress: { prescription_id: number; total: number; done: number; skipped: number; pending: number }
    /** Событие календаря — запланированное дело: поля для отметки и удаления без второго запроса (Р-65). */
    CalendarReminderEvent: {
      type: 'reminder'
      id: number
      at: string
      title: string
      category: components['schemas']['EventCategory']
      status: components['schemas']['ReminderStatus']
      is_overdue: boolean
      source: components['schemas']['ReminderSource']
      repeat_interval_days: number | null
    }
    /** Запись «Заявка» или «Подтверждена»: title — причина обращения, category — по причине (БП §5). */
    CalendarAppointmentEvent: {
      type: 'appointment'
      id: number
      at: string
      title: string
      category: components['schemas']['EventCategory']
      status: components['schemas']['AppointmentStatus']
      clinic: components['schemas']['ClinicRef']
      vet: components['schemas']['VetRef']
    }
    /** Срок следующей прививки: id — прививки, at — дата YYYY-MM-DD, title — название, category — prevention. */
    CalendarVaccinationEvent: {
      type: 'vaccination_due'
      id: number
      at: string
      title: string
      category: components['schemas']['EventCategory']
    }
    CalendarEvent:
      | components['schemas']['CalendarReminderEvent']
      | components['schemas']['CalendarAppointmentEvent']
      | components['schemas']['CalendarVaccinationEvent']
    /** today — с просроченными делами, later — с послезавтра по сегодня + 30 дней (Р-65). */
    Calendar: {
      today: components['schemas']['CalendarEvent'][]
      tomorrow: components['schemas']['CalendarEvent'][]
      later: components['schemas']['CalendarEvent'][]
    }
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
  '/clinics': {
    parameters: NoParams
    get: {
      parameters: NoParams
      requestBody?: never
      responses: { 200: Json<Schemas['Clinic'][]>; 401: Json<Schemas['Error']>; 403: Json<Schemas['Error']> }
    }
  }
  '/clinics/{clinic_id}/vets': {
    parameters: { query?: never; header?: never; path: { clinic_id: number }; cookie?: never }
    get: {
      parameters: { query?: never; header?: never; path: { clinic_id: number }; cookie?: never }
      requestBody?: never
      responses: {
        200: Json<Schemas['Vet'][]>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
      }
    }
  }
  '/clinics/{clinic_id}/vets/{vet_id}/slots': {
    parameters: { query: { date: string }; header?: never; path: { clinic_id: number; vet_id: number }; cookie?: never }
    get: {
      parameters: { query: { date: string }; header?: never; path: { clinic_id: number; vet_id: number }; cookie?: never }
      requestBody?: never
      responses: {
        200: Json<Schemas['Slot'][]>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/appointments': {
    parameters: NoParams
    post: {
      parameters: NoParams
      requestBody: Body<Schemas['AppointmentCreate']>
      responses: {
        201: Json<Schemas['Appointment']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        409: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/appointments/{id}': {
    parameters: AppointmentPath
    get: {
      parameters: AppointmentPath
      requestBody?: never
      responses: {
        200: Json<Schemas['Appointment']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
      }
    }
  }
  '/appointments/{id}/cancel': {
    parameters: AppointmentPath
    post: {
      parameters: AppointmentPath
      requestBody?: never
      responses: {
        200: Json<Schemas['Appointment']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        409: Json<Schemas['Error']>
      }
    }
  }
  '/pets/{pet_id}/appointments': {
    parameters: PetPath
    get: {
      parameters: {
        query?: { status?: Schemas['AppointmentStatus'] }
        header?: never
        path: { pet_id: number }
        cookie?: never
      }
      requestBody?: never
      responses: {
        200: Json<Schemas['Appointment'][]>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/reminders': {
    parameters: NoParams
    get: {
      parameters: {
        query?: {
          pet_id?: number
          date_from?: string
          date_to?: string
          status?: Schemas['ReminderStatus']
          prescription_id?: number
        }
        header?: never
        path?: never
        cookie?: never
      }
      requestBody?: never
      responses: {
        200: Json<Schemas['Reminder'][]>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
    post: {
      parameters: NoParams
      requestBody: Body<Schemas['ReminderCreate']>
      responses: {
        201: Json<Schemas['Reminder']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/reminders/{id}': {
    parameters: ReminderPath
    delete: {
      parameters: ReminderPath
      requestBody?: never
      responses: {
        204: NoContent
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        409: Json<Schemas['Error']>
      }
    }
  }
  '/reminders/{id}/done': {
    parameters: ReminderPath
    post: {
      parameters: ReminderPath
      requestBody?: never
      responses: {
        200: Json<Schemas['ReminderMarked']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        409: Json<Schemas['Error']>
      }
    }
  }
  '/reminders/{id}/skip': {
    parameters: ReminderPath
    post: {
      parameters: ReminderPath
      requestBody?: never
      responses: {
        200: Json<Schemas['ReminderMarked']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        409: Json<Schemas['Error']>
      }
    }
  }
  '/prescriptions/{id}/progress': {
    parameters: PrescriptionPath
    get: {
      parameters: PrescriptionPath
      requestBody?: never
      responses: {
        200: Json<Schemas['PrescriptionProgress']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
      }
    }
  }
  '/calendar': {
    parameters: NoParams
    get: {
      parameters: { query: { pet_id: number }; header?: never; path?: never; cookie?: never }
      requestBody?: never
      responses: {
        200: Json<Schemas['Calendar']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
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
  '/notifications': {
    parameters: NoParams
    get: {
      parameters: { query?: { limit?: number }; header?: never; path?: never; cookie?: never }
      requestBody?: never
      responses: {
        200: Json<Schemas['NotificationList']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/notifications/{id}/read': {
    parameters: AppointmentPath
    post: {
      parameters: AppointmentPath
      requestBody?: never
      responses: { 204: NoContent; 401: Json<Schemas['Error']>; 403: Json<Schemas['Error']>; 404: Json<Schemas['Error']> }
    }
  }
  '/notifications/read-all': {
    parameters: NoParams
    post: {
      parameters: NoParams
      requestBody?: never
      responses: { 204: NoContent; 401: Json<Schemas['Error']>; 403: Json<Schemas['Error']> }
    }
  }
  '/clinic/appointments': {
    parameters: NoParams
    get: {
      parameters: {
        query?: {
          status?: Schemas['AppointmentStatus']
          date_from?: string
          date_to?: string
          vet_id?: number
          awaiting_outcome?: boolean
          requires_decision?: boolean
        }
        header?: never
        path?: never
        cookie?: never
      }
      requestBody?: never
      responses: {
        200: Json<Schemas['Appointment'][]>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/clinic/appointments/{id}/confirm': {
    parameters: AppointmentPath
    post: {
      parameters: AppointmentPath
      requestBody?: never
      responses: {
        200: Json<Schemas['Appointment']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        409: Json<Schemas['Error']>
      }
    }
  }
  '/clinic/appointments/{id}/cancel': {
    parameters: AppointmentPath
    post: {
      parameters: AppointmentPath
      requestBody: Body<Schemas['ClinicAppointmentCancel']>
      responses: {
        200: Json<Schemas['Appointment']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        409: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/clinic/pets/{pet_id}': {
    parameters: PetPath
    get: {
      parameters: PetPath
      requestBody?: never
      responses: {
        200: Json<Schemas['ClinicPetCard']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
      }
    }
    patch: {
      parameters: PetPath
      requestBody: Body<Schemas['ClinicPetUpdate']>
      responses: {
        200: Json<Schemas['Pet']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/clinic/appointments/{id}/outcome': {
    parameters: AppointmentPath
    post: {
      parameters: AppointmentPath
      requestBody: Body<Schemas['OutcomeCreate']>
      responses: {
        200: Json<Schemas['OutcomeResult']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        409: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/clinic/pets/{pet_id}/weight': {
    parameters: PetPath
    post: {
      parameters: PetPath
      requestBody: Body<Schemas['WeightCreate']>
      responses: {
        201: Json<Schemas['Observation']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        422: Json<Schemas['HTTPValidationError']>
      }
    }
  }
  '/clinic/pets/{pet_id}/conditions': {
    parameters: PetPath
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
  '/clinic/pets/{pet_id}/photo': {
    parameters: PetPath
    put: {
      parameters: PetPath
      requestBody: { content: { 'multipart/form-data': { file: Blob } } }
      responses: {
        200: Json<Schemas['PetPhoto']>
        401: Json<Schemas['Error']>
        403: Json<Schemas['Error']>
        404: Json<Schemas['Error']>
        413: Json<Schemas['Error']>
        415: Json<Schemas['Error']>
      }
    }
  }
  '/clinic/pets/{pet_id}/observations': {
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
export type AppointmentReason = Schemas['AppointmentReason']
export type CancelledBy = Schemas['CancelledBy']
export type Slot = Schemas['Slot']
export type Prescription = Schemas['Prescription']
export type AppointmentOutcome = Schemas['AppointmentOutcome']
export type Appointment = Schemas['Appointment']
export type AppointmentCreate = Schemas['AppointmentCreate']
export type UnreadCount = Schemas['UnreadCount']
export type NotificationType = Schemas['NotificationType']
export type Notification = Schemas['Notification']
export type NotificationList = Schemas['NotificationList']
export type ClinicAppointmentCancel = Schemas['ClinicAppointmentCancel']
export type ClinicPetCard = Schemas['ClinicPetCard']
export type PrescriptionCreate = Schemas['PrescriptionCreate']
export type PetUpdateByClinic = Schemas['PetUpdateByClinic']
export type OutcomeCreate = Schemas['OutcomeCreate']
export type OutcomeResult = Schemas['OutcomeResult']
export type ClinicPetUpdate = Schemas['ClinicPetUpdate']
export type WeightCreate = Schemas['WeightCreate']
export type PetPhoto = Schemas['PetPhoto']
export type ReminderSource = Schemas['ReminderSource']
export type ReminderStatus = Schemas['ReminderStatus']
export type Reminder = Schemas['Reminder']
export type ReminderCreate = Schemas['ReminderCreate']
export type ReminderMarked = Schemas['ReminderMarked']
export type PrescriptionProgress = Schemas['PrescriptionProgress']
export type CalendarReminderEvent = Schemas['CalendarReminderEvent']
export type CalendarAppointmentEvent = Schemas['CalendarAppointmentEvent']
export type CalendarVaccinationEvent = Schemas['CalendarVaccinationEvent']
export type CalendarEvent = Schemas['CalendarEvent']
export type Calendar = Schemas['Calendar']
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
