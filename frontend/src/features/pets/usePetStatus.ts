import { useState } from 'react'

/**
 * Строка статуса страницы выбранного питомца. Сообщение относится к питомцу, при котором его показали:
 * после переключения оно не висит над чужими данными.
 */
export function usePetStatus(petId: number | undefined): [message: string, show: (text: string) => void] {
  const [status, setStatus] = useState<{ petId: number; text: string } | null>(null)

  function show(text: string) {
    if (petId !== undefined) setStatus({ petId, text })
  }

  return [status && status.petId === petId ? status.text : '', show]
}
