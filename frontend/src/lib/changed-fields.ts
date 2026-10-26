/** Как сравнить поле, если === не подходит: например, массив рабочих дней. */
type FieldEquals<T> = { [K in keyof T]?: (next: T[K], current: T[K]) => boolean }

/**
 * Только изменённые поля для PATCH: он не перезаписывает то, что пользователь не трогал.
 * next — тело запроса из формы, current — запись на момент открытия формы; поля сравниваются через ===.
 */
export function changedFields<T extends object>(
  next: T,
  current: NoInfer<T>,
  equals: FieldEquals<T> = {},
): Partial<T> {
  const update: Partial<T> = {}
  for (const key of Object.keys(next) as (keyof T)[]) {
    const same = equals[key] ?? ((a, b) => a === b)
    if (!same(next[key], current[key])) update[key] = next[key]
  }
  return update
}
