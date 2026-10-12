import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { ApiError } from '../../api/errors'
import { meQuery } from '../../api/queries'
import type { Role } from '../../api/schema'
import { homePathFor } from '../../app/navigation'
import { Button, EmptyState, Spinner } from '../../components/ui'

export function RequireRole({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { data: user, error, isPending, refetch } = useQuery(meQuery)

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner label="Проверяем вход" />
      </div>
    )
  }
  // БП §1: на экран входа — только когда входа нет; сбой сервера или сети не разлогинивает.
  const signedOut = error instanceof ApiError && error.status === 401
  if (signedOut || (!user && !error)) return <Navigate to="/login" replace />
  if (!user) {
    return (
      <div className="grid min-h-dvh place-items-center p-4">
        <EmptyState
          title="Не удалось загрузить данные"
          description="Проверьте соединение и попробуйте ещё раз."
          action={<Button onClick={() => void refetch()}>Повторить</Button>}
        />
      </div>
    )
  }
  if (!allow.includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />
  return children
}
