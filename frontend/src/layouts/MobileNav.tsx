import { NavLink } from 'react-router-dom'
import type { NavItem } from '../app/navigation'
import { toneInkClass, toneSoftClass } from '../components/ui'
import { cn } from '../lib/cn'

export function MobileNav({ items }: { items: NavItem[] }) {
  return (
    <nav
      aria-label="Разделы, мобильная навигация"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn('flex flex-col items-center gap-1 px-1 py-2 text-[11px] font-bold', isActive ? toneInkClass[item.tone] : 'text-ink-muted')
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn('grid h-7 w-12 place-items-center rounded-full', isActive && toneSoftClass[item.tone])}>
                    <item.icon aria-hidden className="size-5" />
                  </span>
                  {item.shortLabel}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
