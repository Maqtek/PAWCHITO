import { queryOptions } from '@tanstack/react-query'
import { api } from './client'
import { ApiError } from './errors'

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
