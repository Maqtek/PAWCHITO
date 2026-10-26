import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { ApiError } from '../../api/errors'
import { meQuery } from '../../api/queries'
import type { Role } from '../../api/schema'
import { homePathFor } from '../../app/navigation'
import { LoadError, Spinner } from '../../components/ui'

interface RequireRoleProps {
  /** Какие роли пускать; без allow — любую. */
  allow?: Role[]
  /** Экран смены временного пароля: пускает только с must_change_password, остальных — на главную роли. */
  passwordChange?: boolean
  children: ReactNode
}

export function RequireRole({ allow, passwordChange = false, children }: RequireRoleProps) {
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
  if (signedOut) return <Navigate to="/login" replace />
  if (!user) {
    return (
      <div className="grid min-h-dvh place-items-center p-4">
        <LoadError title="Не удалось загрузить данные" onRetry={() => void refetch()} />
      </div>
    )
  }
  // Временный пароль: пока не сменён, доступен только экран смены, а он — только с временным паролем.
  // Строго === true: без поля в ответе undefined !== false увёл бы всех по кругу через /change-password.
  if ((user.must_change_password === true) !== passwordChange) {
    return <Navigate to={passwordChange ? homePathFor(user.role) : '/change-password'} replace />
  }
  if (allow && !allow.includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />
  return children
}
