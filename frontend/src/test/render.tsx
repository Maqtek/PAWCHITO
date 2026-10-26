import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter, parsePath } from 'react-router-dom'
import { createQueryClient } from '../app/queryClient'
import { AppRoutes } from '../app/routes'
import { SessionEvents } from '../features/session/SessionEvents'

const renderedClients = new Set<QueryClient>()

/**
 * Ждёт, пока клиенты теста закончат запросы, и забывает их. Запросы размонтированных компонентов не отменяются:
 * после сброса моков старый токен снова валиден, и поздний 401/403 ударит событием в следующий тест.
 */
export async function settleRenderedClients(): Promise<void> {
  try {
    await waitFor(() => {
      for (const client of renderedClients) {
        if (client.isFetching() + client.isMutating() > 0) throw new Error('Запросы теста ещё идут')
      }
    })
  } finally {
    renderedClients.clear()
  }
}

export function renderWithProviders(ui: ReactElement, { route = '/', state }: { route?: string; state?: unknown } = {}) {
  const queryClient = createQueryClient({ retry: false })
  renderedClients.add(queryClient)
  const user = userEvent.setup()
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ ...parsePath(route), state }]}>
        <SessionEvents />
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...result, user, queryClient }
}

/** Всё приложение на адресе route — как его откроет пользователь. */
export const renderRoute = (route: string) => renderWithProviders(<AppRoutes />, { route })
