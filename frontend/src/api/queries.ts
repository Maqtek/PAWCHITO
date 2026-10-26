import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { api } from './client'
import { ApiError } from './errors'
import type { AppointmentStatus, ReminderStatus } from './schema'

interface ApiResult<T> {
  data?: T
  error?: unknown
  response: Response
}

/** Данные ответа или ApiError с текстом из {"detail": "..."}. У 204 данных нет — undefined. */
export async function unwrap<T>(request: Promise<ApiResult<T>>): Promise<T> {
  const { data, error, response } = await request
  if (response.ok) return data as T
  throw ApiError.fromResponse(response, error)
}

export const queryKeys = {
  me: ['me'] as const,
  pets: ['pets'] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
  adminClinics: ['admin', 'clinics'] as const,
  adminClinic: (id: number) => ['admin', 'clinics', id] as const,
  clinicVets: ['clinic', 'vets'] as const,
  // Не под ['pets']: перечитывание списка питомцев не должно задевать записи здоровья.
  conditions: (petId: number) => ['health', petId, 'conditions'] as const,
  observations: (petId: number) => ['health', petId, 'observations'] as const,
  vaccinations: (petId: number) => ['health', petId, 'vaccinations'] as const,
  // Лента собрана из записей здоровья: их изменение перечитывает и её (health-cache).
  timeline: (petId: number) => ['health', petId, 'timeline'] as const,
  bookingClinics: ['booking', 'clinics'] as const,
  bookingVets: (clinicId: number) => ['booking', 'clinics', clinicId, 'vets'] as const,
  slots: (vetId: number, date: string) => ['booking', 'slots', vetId, date] as const,
  // Слоты всех врачей и дат: новая запись занимает время, отмена освобождает.
  allSlots: ['booking', 'slots'] as const,
  // Под общим ['appointments']: отмена или новая запись перечитывает и список, и карточку.
  appointments: ['appointments'] as const,
  petAppointments: (petId: number) => ['appointments', 'pet', petId] as const,
  appointment: (id: number) => ['appointments', id] as const,
  // Под общим ['notifications']: отметка прочитанным перечитывает и список, и счётчик в шапке.
  notifications: ['notifications', 'list'] as const,
  // Всё об уведомлениях: список, уведомления главной и счётчик в шапке.
  allNotifications: ['notifications'] as const,
  // Под общим ['clinic', 'appointments']: подтверждение или отмена перечитывает все вкладки.
  clinicAppointments: ['clinic', 'appointments'] as const,
  clinicAppointmentsFiltered: (filters: ClinicAppointmentFilters) => ['clinic', 'appointments', filters] as const,
  clinicPet: (petId: number) => ['clinic', 'pets', petId] as const,
  // Карточки всех питомцев клиники: доступ к ним зависит от записей (Р-54).
  allClinicPets: ['clinic', 'pets'] as const,
  clinicPetObservations: (petId: number) => ['clinic', 'pets', petId, 'observations'] as const,
  // Под общим ['reminders']: отметка, новое дело или удаление перечитывает «Дела», «Курс лечения» и прогресс курсов.
  reminders: ['reminders'] as const,
  remindersFiltered: (filters: ReminderFilters) => ['reminders', filters] as const,
  prescriptionProgress: (prescriptionId: number) => ['reminders', 'progress', prescriptionId] as const,
  // Под общим ['reminders']: отметка дела на главной перечитывает сводку тем же refetchReminders.
  homeSummary: (petId: number) => ['reminders', 'home', petId] as const,
  // Под ['notifications', 'list']: отметка прочитанным в колокольчике перечитывает и уведомления главной.
  latestNotifications: (limit: number) => ['notifications', 'list', limit] as const,
  // Тоже под ['reminders']: календарь перечитывается после отметки, нового дела и удаления.
  calendar: (petId: number) => ['reminders', 'calendar', petId] as const,
}

/** Фильтры записей клиники (Р-52): пустые не передаются. */
export interface ClinicAppointmentFilters {
  status?: AppointmentStatus
  date_from?: string
  date_to?: string
  vet_id?: number
  awaiting_outcome?: boolean
  requires_decision?: boolean
}

/** Фильтры дел (Р-60): пустые не передаются, даты — по плановой дате включительно. */
interface ReminderFilters {
  pet_id?: number
  date_from?: string
  date_to?: string
  status?: ReminderStatus
  prescription_id?: number
}

export const meQuery = queryOptions({
  queryKey: queryKeys.me,
  queryFn: () => unwrap(api.GET('/users/me')),
})

export const petsQuery = queryOptions({
  queryKey: queryKeys.pets,
  queryFn: () => unwrap(api.GET('/pets')),
})

export const unreadCountQuery = queryOptions({
  queryKey: queryKeys.unreadCount,
  queryFn: () => unwrap(api.GET('/notifications/unread-count')),
  // БП §9: опрос раз в 60 секунд, без WebSocket.
  refetchInterval: 60_000,
})

export const adminClinicsQuery = queryOptions({
  queryKey: queryKeys.adminClinics,
  queryFn: () => unwrap(api.GET('/admin/clinics')),
})

export const adminClinicQuery = (id: number) =>
  queryOptions({
    queryKey: queryKeys.adminClinic(id),
    queryFn: () => unwrap(api.GET('/admin/clinics/{id}', { params: { path: { id } } })),
  })

/** Врачи своей клиники вместе с архивными: страница делит их на вкладки сама. */
export const clinicVetsQuery = queryOptions({
  queryKey: queryKeys.clinicVets,
  queryFn: () => unwrap(api.GET('/clinic/vets', { params: { query: { include_archived: true } } })),
})

const petPath = (petId: number) => ({ params: { path: { pet_id: petId } } })

/** Особенности здоровья выбранного питомца: свои и от клиник, без архивных (Р-44). */
export const conditionsQuery = (petId: number) =>
  queryOptions({
    queryKey: queryKeys.conditions(petId),
    queryFn: () => unwrap(api.GET('/pets/{pet_id}/conditions', petPath(petId))),
  })

/** Весь дневник выбранного питомца, новые наблюдения сверху (Р-45). */
export const observationsQuery = (petId: number) =>
  queryOptions({
    queryKey: queryKeys.observations(petId),
    queryFn: () => unwrap(api.GET('/pets/{pet_id}/observations', petPath(petId))),
  })

export const vaccinationsQuery = (petId: number) =>
  queryOptions({
    queryKey: queryKeys.vaccinations(petId),
    queryFn: () => unwrap(api.GET('/pets/{pet_id}/vaccinations', petPath(petId))),
  })

/** Элементов ленты на страницу: день сервер не разрывает, поэтому страница бывает и больше (Р-66). */
const TIMELINE_PAGE_SIZE = 20

/**
 * Лента истории питомца страницами по датам (Р-66): следующая — с before = дата последнего элемента. Страница меньше
 * лимита, в том числе пустая, — конец ленты: меньше лимита сервер отдаёт, только когда раньше ничего нет.
 */
export const timelineQuery = (petId: number) =>
  infiniteQueryOptions({
    queryKey: queryKeys.timeline(petId),
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/pets/{pet_id}/timeline', {
          params: {
            path: { pet_id: petId },
            query: pageParam === null ? { limit: TIMELINE_PAGE_SIZE } : { before: pageParam, limit: TIMELINE_PAGE_SIZE },
          },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.length < TIMELINE_PAGE_SIZE ? undefined : lastPage[lastPage.length - 1].date),
  })

/** Активные клиники для записи (Р-49). */
export const bookingClinicsQuery = queryOptions({
  queryKey: queryKeys.bookingClinics,
  queryFn: () => unwrap(api.GET('/clinics')),
})

/** Врачи клиники, к которым можно записаться: без отпуска и архива. */
export const bookingVetsQuery = (clinicId: number) =>
  queryOptions({
    queryKey: queryKeys.bookingVets(clinicId),
    queryFn: () => unwrap(api.GET('/clinics/{clinic_id}/vets', { params: { path: { clinic_id: clinicId } } })),
  })

/** Свободные слоты врача на дату: всегда свежие — их в любой момент может занять другой владелец. */
export const slotsQuery = (clinicId: number, vetId: number, date: string) =>
  queryOptions({
    queryKey: queryKeys.slots(vetId, date),
    queryFn: () =>
      unwrap(
        api.GET('/clinics/{clinic_id}/vets/{vet_id}/slots', {
          params: { path: { clinic_id: clinicId, vet_id: vetId }, query: { date } },
        }),
      ),
    staleTime: 0,
  })

/** Все записи питомца, от поздних к ранним (Р-51). */
export const petAppointmentsQuery = (petId: number) =>
  queryOptions({
    queryKey: queryKeys.petAppointments(petId),
    queryFn: () => unwrap(api.GET('/pets/{pet_id}/appointments', petPath(petId))),
  })

export const appointmentQuery = (id: number) =>
  queryOptions({
    queryKey: queryKeys.appointment(id),
    queryFn: () => unwrap(api.GET('/appointments/{id}', { params: { path: { id } } })),
  })

/** Последние 50 уведомлений — запрашиваются, когда открыт список (БП §9). */
export const notificationsQuery = queryOptions({
  queryKey: queryKeys.notifications,
  queryFn: () => unwrap(api.GET('/notifications')),
})

export const clinicAppointmentsQuery = (filters: ClinicAppointmentFilters) =>
  queryOptions({
    queryKey: queryKeys.clinicAppointmentsFiltered(filters),
    queryFn: () => unwrap(api.GET('/clinic/appointments', { params: { query: filters } })),
  })

/** Карточка питомца для клиники: доступна при неотменённой записи в эту клинику (Р-54). */
export const clinicPetQuery = (petId: number) =>
  queryOptions({
    queryKey: queryKeys.clinicPet(petId),
    queryFn: () => unwrap(api.GET('/clinic/pets/{pet_id}', petPath(petId))),
  })

export const clinicPetObservationsQuery = (petId: number) =>
  queryOptions({
    queryKey: queryKeys.clinicPetObservations(petId),
    queryFn: () => unwrap(api.GET('/clinic/pets/{pet_id}/observations', petPath(petId))),
  })

/** Дела по плановому времени, от ранних к поздним (Р-60). */
export const remindersQuery = (filters: ReminderFilters) =>
  queryOptions({
    queryKey: queryKeys.remindersFiltered(filters),
    queryFn: () => unwrap(api.GET('/reminders', { params: { query: filters } })),
  })

/** Прогресс курса: просроченные дела входят в pending (Р-63). */
export const prescriptionProgressQuery = (prescriptionId: number) =>
  queryOptions({
    queryKey: queryKeys.prescriptionProgress(prescriptionId),
    queryFn: () => unwrap(api.GET('/prescriptions/{id}/progress', { params: { path: { id: prescriptionId } } })),
  })

/**
 * Сводка главной (Р-64). Всегда свежая при открытии: её меняют не только дела, но и записи и итог приёма, а ключ —
 * под ['reminders'].
 */
export const homeSummaryQuery = (petId: number) =>
  queryOptions({
    queryKey: queryKeys.homeSummary(petId),
    queryFn: () => unwrap(api.GET('/home/summary', { params: { query: { pet_id: petId } } })),
    staleTime: 0,
  })

/** Последние уведомления на главной, от новых к старым (Р-55). */
export const latestNotificationsQuery = (limit: number) =>
  queryOptions({
    queryKey: queryKeys.latestNotifications(limit),
    queryFn: () => unwrap(api.GET('/notifications', { params: { query: { limit } } })),
  })

/**
 * Календарь питомца: дела, записи и сроки прививок на 30 дней по группам (Р-65). Всегда свежий при открытии раздела:
 * записи и прививки меняются в других разделах, а они перечитывают только свои списки.
 */
export const calendarQuery = (petId: number) =>
  queryOptions({
    queryKey: queryKeys.calendar(petId),
    queryFn: () => unwrap(api.GET('/calendar', { params: { query: { pet_id: petId } } })),
    staleTime: 0,
  })
