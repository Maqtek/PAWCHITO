import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SessionReason } from '../../api/error-messages'
import { meQuery } from '../../api/queries'
import { finishPendingLogout, onSessionChange, type SessionEvent } from '../../api/session'
import { forgetSelectedPet } from '../pets/useSelectedPet'

function reasonFor(
  event: Exclude<SessionEvent, { type: 'signed-in-elsewhere' } | { type: 'password-change-required' }>,
): SessionReason | null {
  if (event.type === 'signed-out') return event.serverConfirmed ? null : 'logout-pending'
  return event.type
}

/**
 * События сессии → кэш и навигация: выход и истечение ведут на вход, вход в другой вкладке — в кабинет,
 * временный пароль — на его смену.
 */
export function SessionEvents() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  useEffect(
    () =>
      onSessionChange((event) => {
        if (event.type === 'password-change-required') {
          // Сервер сказал это явно: флаг ставим в кэше сами — устаревший me без флага вернул бы на страницу с тем же 403.
          const me = queryClient.getQueryData(meQuery.queryKey)
          queryClient.clear()
          if (me) queryClient.setQueryData(meQuery.queryKey, { ...me, must_change_password: true })
          navigate('/change-password', { replace: true })
          return
        }
        queryClient.clear()
        if (event.type === 'signed-in-elsewhere') {
          navigate('/', { replace: true })
          return
        }
        forgetSelectedPet()
        const reason = reasonFor(event)
        navigate('/login', { replace: true, state: reason ? { reason } : null })
      }),
    [queryClient, navigate],
  )

  // Выход, начатый без сети, доводим при запуске — даже если приложение открыто на /login без запросов к API.
  useEffect(() => {
    void finishPendingLogout()
  }, [])

  return null
}
