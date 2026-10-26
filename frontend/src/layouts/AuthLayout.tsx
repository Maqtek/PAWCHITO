import type { ReactNode } from 'react'
import { Card, Spinner } from '../components/ui'
import { Logo } from './Logo'

interface AuthLayoutProps {
  title: string
  /** Пока проверяется, не вошёл ли уже пользователь, — спиннер вместо формы. */
  checking?: boolean
  children: ReactNode
}

/** Вход, регистрация, восстановление: карточка по центру, без оболочки кабинета. */
export function AuthLayout({ title, checking = false, children }: AuthLayoutProps) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <title>{`${title} — PAWCHITO`}</title>
      <Card className="w-full max-w-sm p-6 sm:p-8">
        <Logo />
        <h1 className="mt-6 text-2xl font-extrabold">{title}</h1>
        {checking ? (
          <div className="mt-6">
            <Spinner label="Проверяем вход" />
          </div>
        ) : (
          children
        )}
      </Card>
    </main>
  )
}
