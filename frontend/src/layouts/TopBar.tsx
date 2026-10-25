import { Link } from 'react-router-dom'
import type { User } from '../api/schema'
import { Logo } from './Logo'
import { NotificationBell } from './NotificationBell'
import { PetSwitcher } from './PetSwitcher'
import { UserMenu } from './UserMenu'

export function TopBar({ user, homePath }: { user: User; homePath: string }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur md:h-20 md:border-b-0 md:px-10">
      <Link to={homePath} aria-label="PAWCHITO — на главную" className="md:hidden">
        <Logo compact />
      </Link>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {user.role === 'owner' && <PetSwitcher />}
        {user.role !== 'admin' && <NotificationBell />}
        {/* На низком экране (телефон боком) меню в сайдбаре уходит под сгиб — дублируем его здесь. */}
        <div className="md:hidden [@media(max-height:560px)]:block">
          <UserMenu user={user} compact />
        </div>
      </div>
    </header>
  )
}
