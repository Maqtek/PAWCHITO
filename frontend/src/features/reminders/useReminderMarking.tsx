import { useState } from 'react'
import type { Reminder, ReminderMarked } from '../../api/schema'
import { useFocusAfterRender } from '../../lib/use-focus-after-render'
import { markedMessage } from './reminder-actions'
import { ReminderConfirmModal } from './ReminderConfirmModal'

/**
 * Отметка дел списка — «Сегодня» на главной, дни курса: статус после отметки, фокус на список, пропуск — через окно
 * подтверждения. listRef — на список, skipModal выводит компонент, вызвавший хук.
 */
export function useReminderMarking<T extends HTMLElement>(today: string, onStatus: (message: string) => void) {
  const [skipping, setSkipping] = useState<{ reminder?: Reminder; open: boolean }>({ open: false })
  // Отмеченное дело пропадает вместе со своими кнопками — без этого фокус упадёт на body.
  const [listRef, focusListLater] = useFocusAfterRender<T>()

  function marked(result: ReminderMarked) {
    onStatus(markedMessage(result, today))
    focusListLater()
  }

  function skip(reminder: Reminder) {
    // Старое сообщение не висит над открытым окном, а тот же текст после пропуска озвучится заново.
    onStatus('')
    setSkipping({ reminder, open: true })
  }

  function close() {
    setSkipping((current) => ({ ...current, open: false }))
  }

  const skipModal = (
    <ReminderConfirmModal
      open={skipping.open}
      kind="skip"
      reminder={skipping.reminder}
      today={today}
      onClose={close}
      onSkipped={(result) => {
        marked(result)
        close()
      }}
    />
  )

  return { listRef, marked, skip, skipModal }
}
