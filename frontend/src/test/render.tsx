import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { createQueryClient } from '../app/queryClient'
import { SessionEvents } from '../features/session/SessionEvents'

export function renderWithProviders(ui: ReactElement, { route = '/', state }: { route?: string; state?: unknown } = {}) {
  const queryClient = createQueryClient({ retry: false })
  const user = userEvent.setup()
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: route, state }]}>
        <SessionEvents />
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...result, user, queryClient }
}
