import type { ReactNode } from 'react'
import { Card } from '../components/ui'
import { Logo } from './Logo'

/** Вход, регистрация, восстановление: карточка по центру, без оболочки кабинета. */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <title>{`${title} — PAWCHITO`}</title>
      <Card className="w-full max-w-sm p-6 sm:p-8">
        <Logo />
        <h1 className="mt-6 text-2xl font-extrabold">{title}</h1>
        {children}
      </Card>
    </div>
  )
}
