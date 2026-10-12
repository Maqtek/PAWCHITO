import { useQueryClient } from '@tanstack/react-query'
import { Ellipsis, LogOut, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { setAccessToken } from '../api/auth-token'
import { api } from '../api/client'
import type { User } from '../api/schema'
import { Avatar, Dropdown, menuItemClass } from '../components/ui'
import { roleLabel } from '../lib/labels'

export function UserMenu({ user, compact = false }: { user: User; compact?: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  async function logout() {
    try {
      await api.POST('/auth/logout')
    } catch {
      // сеть недоступна — выходим локально
    } finally {
      setAccessToken(null)
      queryClient.clear()
      navigate('/login', { replace: true })
    }
  }

  const button = compact ? (
    <Avatar name={user.full_name} className="size-9" />
  ) : (
    <span className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface-muted">
      <Avatar name={user.full_name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-extrabold">{user.full_name}</span>
        <span className="block text-xs text-ink-muted">{roleLabel[user.role]}</span>
      </span>
      <Ellipsis aria-hidden className="size-4 text-ink-muted" />
    </span>
  )

  return (
    <Dropdown label="Меню пользователя" button={button} align={compact ? 'end' : 'start'} placement={compact ? 'bottom' : 'top'}>
      {(close) => (
        <>
          <Link to="/profile" className={menuItemClass} onClick={close}>
            <UserRound aria-hidden className="size-4" />
            Профиль
          </Link>
          <button
            type="button"
            className={menuItemClass}
            onClick={() => {
              close()
              void logout()
            }}
          >
            <LogOut aria-hidden className="size-4" />
            Выйти
          </button>
        </>
      )}
    </Dropdown>
  )
}
