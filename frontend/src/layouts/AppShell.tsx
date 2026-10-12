import { useQuery } from '@tanstack/react-query'
import { Outlet } from 'react-router-dom'
import { meQuery } from '../api/queries'
import { homePathFor, navigation } from '../app/navigation'
import { Disclaimer } from './Disclaimer'
import { MobileNav } from './MobileNav'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

/** Общая оболочка кабинета: роль уже проверил RequireRole выше по дереву. */
export function AppShell() {
  const { data: user } = useQuery(meQuery)
  if (!user) return null
  const items = navigation[user.role]

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
      <Sidebar user={user} items={items} />
      <div className="flex min-h-dvh min-w-0 flex-col pb-20 md:pb-0">
        <TopBar user={user} homePath={homePathFor(user.role)} />
        <main className="flex-1 px-4 pt-2 pb-8 md:px-10">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
        {user.role === 'owner' && <Disclaimer />}
        <MobileNav items={items} />
      </div>
    </div>
  )
}
