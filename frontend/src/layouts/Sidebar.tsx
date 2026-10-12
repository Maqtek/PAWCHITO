import { Link, NavLink } from 'react-router-dom'
import type { User } from '../api/schema'
import type { NavItem } from '../app/navigation'
import { toneSoftClass } from '../components/ui'
import { cn } from '../lib/cn'
import { CareTip } from './CareTip'
import { Logo } from './Logo'
import { UserMenu } from './UserMenu'

export function Sidebar({ user, items }: { user: User; items: NavItem[] }) {
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r border-line bg-surface px-4 py-6 md:flex">
      <Link to={items[0].to} aria-label="PAWCHITO — на главную" className="px-2">
        <Logo />
      </Link>
      <nav aria-label="Разделы" className="mt-8">
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors',
                    isActive ? cn(toneSoftClass[item.tone], 'font-extrabold') : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                  )
                }
              >
                <item.icon aria-hidden className="size-5 shrink-0" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-auto flex flex-col gap-4">
        {user.role === 'owner' && <CareTip />}
        <div className="border-t border-line pt-3">
          <UserMenu user={user} />
        </div>
      </div>
    </aside>
  )
}
