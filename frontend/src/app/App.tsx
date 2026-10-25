import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { SessionEvents } from '../features/session/SessionEvents'
import { createQueryClient } from './queryClient'
import { AppRoutes } from './routes'

const queryClient = createQueryClient()

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionEvents />
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
