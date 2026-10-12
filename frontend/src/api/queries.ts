import { queryOptions } from '@tanstack/react-query'
import { api } from './client'
import { ApiError } from './errors'

interface ApiResult<T> {
  data?: T
  error?: unknown
  response: Response
}

/** Данные ответа или ApiError с текстом из {"detail": "..."}. */
async function unwrap<T>(request: Promise<ApiResult<T>>): Promise<T> {
  const { data, error, response } = await request
  if (error === undefined && data !== undefined) return data
  const detail =
    typeof error === 'object' && error !== null && 'detail' in error ? String(error.detail) : response.statusText
  throw new ApiError(response.status, detail)
}

export const queryKeys = {
  me: ['me'] as const,
  pets: ['pets'] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
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
