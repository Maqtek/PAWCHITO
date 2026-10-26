import { useState } from 'react'
import { useFocusAfterRender } from '../../lib/use-focus-after-render'

interface Dialog<K, T> {
  kind?: K
  record?: T
  /** Закрытое окно хранит свои данные до следующего открытия — заголовок не меняется, пока окно закрывается. */
  open: boolean
}

/**
 * Окна раздела здоровья со списком записей: какое окно открыто и для какой записи.
 * Данные записи в окне — из свежего списка; пропала из списка — последние известные.
 * Запись пропала вместе с кнопкой, открывшей окно (в архиве, удалена), — фокус уходит на список через listRef.
 */
export function useRecordDialog<K extends string, T extends { id: number }>(
  list: T[] | undefined,
  onStatus: (message: string) => void,
) {
  const [dialog, setDialog] = useState<Dialog<K, T>>({ open: false })
  const [listRef, focusListLater] = useFocusAfterRender<HTMLDivElement>()
  const record = dialog.record && (list?.find((item) => item.id === dialog.record?.id) ?? dialog.record)

  function open(kind: K, next?: T) {
    // Старое сообщение не висит над открытым окном, а тот же текст после следующего действия озвучится заново.
    onStatus('')
    setDialog({ kind, record: next, open: true })
  }

  /** gone — запись точно ушла из списка, даже если список ещё не перечитан. */
  function close({ gone = false } = {}) {
    if (dialog.record && (gone || !list?.some((item) => item.id === dialog.record?.id))) focusListLater()
    setDialog((current) => ({ ...current, open: false }))
  }

  return { kind: dialog.kind, isOpen: dialog.open, record, open, close, listRef }
}
