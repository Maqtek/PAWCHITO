import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { petsQuery } from '../../api/queries'
import type { Pet } from '../../api/schema'

// БП §2: выбранный питомец хранится на клиенте.
const STORAGE_KEY = 'pawchito:selected-pet-id'
const listeners = new Set<() => void>()

function readSelectedId(): number | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value ? Number(value) : null
  } catch {
    return null
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function selectPet(id: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(id))
  } catch {
    // приватный режим: выбор живёт до перезагрузки
  }
  listeners.forEach((listener) => listener())
}

/** Забыть выбор при выходе: следующий вход начнётся с первого питомца. */
export function forgetSelectedPet(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // хранилище недоступно — забывать нечего
  }
  listeners.forEach((listener) => listener())
}

export function useSelectedPet(): {
  pets: Pet[]
  pet: Pet | null
  select: (id: number) => void
  isPending: boolean
  isError: boolean
  refetch: UseQueryResult<Pet[]>['refetch']
} {
  const { data: pets = [], isPending, isError, refetch } = useQuery(petsQuery)
  const selectedId = useSyncExternalStore(subscribe, readSelectedId, () => null)
  const pet = pets.find((item) => item.id === selectedId) ?? pets[0] ?? null
  return { pets, pet, select: selectPet, isPending, isError, refetch }
}
