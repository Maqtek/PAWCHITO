import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { meQuery } from '../../api/queries'
import { homePathFor } from '../../app/navigation'

/** Экраны для гостей: вошедшего сразу уводим на главную его роли. enabled = false — не трогаем (показан код восстановления). */
export function useRedirectSignedIn(enabled = true): { checking: boolean } {
  const navigate = useNavigate()
  const { data: user, isPending } = useQuery({ ...meQuery, enabled })

  useEffect(() => {
    if (enabled && user) navigate(homePathFor(user.role), { replace: true })
  }, [enabled, user, navigate])

  return { checking: enabled && isPending }
}
