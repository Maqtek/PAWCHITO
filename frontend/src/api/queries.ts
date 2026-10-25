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
