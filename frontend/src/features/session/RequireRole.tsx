import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { meQuery } from '../../api/queries'
import type { Role } from '../../api/schema'
import { homePathFor } from '../../app/navigation'
import { Spinner } from '../../components/ui'

export function RequireRole({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { data: user, isPending } = useQuery(meQuery)

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner label="Проверяем вход" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (!allow.includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />
  return children
}
