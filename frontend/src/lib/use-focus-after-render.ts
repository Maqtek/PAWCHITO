import { useEffect, useRef, type RefObject } from 'react'

/**
 * Фокус на элемент после следующего рендера: кнопка, с которой начали, пропала вместе с записью или окном —
 * без этого фокус упадёт на body. focusLater() ставит метку, эффект без зависимостей переводит фокус после рендера.
 *
 * Эффект принадлежит компоненту, вызвавшему хук. Эффекты дочерних выполняются раньше: Modal уже закрыл окно
 * и вернул фокус на кнопку, а элемент получает его последним.
 *
 * target — куда именно внутри элемента, если не на него самого: например, на выбранную вкладку.
 */
export function useFocusAfterRender<T extends HTMLElement>(
  target?: (element: T) => HTMLElement | null,
): [RefObject<T | null>, () => void] {
  const ref = useRef<T>(null)
  const pending = useRef(false)

  useEffect(() => {
    if (!pending.current) return
    pending.current = false
    const element = ref.current
    if (element) (target ? target(element) : element)?.focus()
  })

  function focusLater() {
    pending.current = true
  }

  return [ref, focusLater]
}
