import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { meQuery } from '../../api/queries'
import { signOut } from '../../api/session'
import { homePathFor } from '../../app/navigation'
import { Button } from '../../components/ui'
import { ChangePasswordForm } from '../../features/auth/ChangePasswordForm'
import { AuthLayout } from '../../layouts/AuthLayout'

/** Временный пароль от администратора: пока не сменён, доступна только эта форма. Пускает RequireRole с passwordChange. */
export function ChangePasswordPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: user } = useQuery(meQuery)
  if (!user) return null

  return (
    <AuthLayout title="Смена пароля">
      <p className="mt-2 text-sm text-ink-muted">
        Администратор выдал временный пароль. Придумайте новый, чтобы продолжить.
      </p>
      <div className="mt-6">
        <ChangePasswordForm
          currentLabel="Временный пароль"
          onSuccess={() => {
            queryClient.setQueryData(meQuery.queryKey, { ...user, must_change_password: false })
            navigate(homePathFor(user.role), { replace: true })
          }}
        />
      </div>
      {/* Очистку кэша и переход на /login делает SessionEvents. */}
      <Button variant="ghost" fullWidth className="mt-4" onClick={() => void signOut()}>
        Выйти
      </Button>
    </AuthLayout>
  )
}
