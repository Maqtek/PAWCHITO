import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/errors'

export function createQueryClient({ retry = true }: { retry?: boolean } = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // 4xx не повторяем: 401 уже обработал клиент, остальное — ошибка запроса.
        retry: retry
          ? (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 2
          : false,
      },
    },
  })
}
