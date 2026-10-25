import { Ellipsis, LogOut, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { User } from '../api/schema'
import { signOut } from '../api/session'
import { Avatar, Dropdown, menuItemClass } from '../components/ui'
import { roleLabel } from '../lib/labels'

export function UserMenu({ user, compact = false }: { user: User; compact?: boolean }) {
  const button = compact ? (
    <Avatar name={user.full_name} className="size-10" />
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

  // Доступное имя начинается с видимого текста кнопки (WCAG 2.5.3): у компактной видны только инициалы.
  const label = compact
    ? `Меню пользователя: ${user.full_name}`
    : `${user.full_name}, ${roleLabel[user.role]} — меню пользователя`

  return (
    <Dropdown label={label} button={button} align={compact ? 'end' : 'start'} placement={compact ? 'bottom' : 'top'}>
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
              // Очистку кэша и переход на /login делает SessionEvents.
              void signOut()
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
