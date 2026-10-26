/**
 * Группы по ключу в порядке первого появления ключа, внутри группы — порядок списка.
 * Например, дни ленты или курса: «YYYY-MM-DD» → элементы этого дня.
 */
export function groupBy<T, K>(items: readonly T[], key: (item: T) => K): [K, T[]][] {
  const groups = new Map<K, T[]>()
  for (const item of items) {
    const value = key(item)
    groups.set(value, [...(groups.get(value) ?? []), item])
  }
  return [...groups]
}
