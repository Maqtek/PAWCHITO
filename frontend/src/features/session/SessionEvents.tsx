import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SessionReason } from '../../api/error-messages'
import { onSessionChange, type SessionEvent } from '../../api/session'
import { forgetSelectedPet } from '../pets/useSelectedPet'

function reasonFor(event: Exclude<SessionEvent, { type: 'signed-in-elsewhere' }>): SessionReason | null {
  if (event.type === 'signed-out') return event.serverConfirmed ? null : 'logout-pending'
  return event.type
}

/** События сессии → кэш и навигация: выход и истечение ведут на вход, вход в другой вкладке — в кабинет. */
export function SessionEvents() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  useEffect(
    () =>
      onSessionChange((event) => {
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

  return null
}
