import type { Pet, Role } from '../api/schema'

export const pets: Pet[] = [
  {
    id: 10,
    owner_id: 1,
    name: 'Майло',
    species: 'dog',
    breed: 'Золотистый ретривер',
    birth_date: '2022-05-01',
    sex: 'male',
    photo_url: null,
    care_status: 'treatment',
    care_status_set_at: '2026-10-10T10:40:00+03:00',
    care_status_clinic: { id: 2, name: 'ВетДоктор' },
    archived_at: null,
  },
  {
    id: 11,
    owner_id: 1,
    name: 'Барсик',
    species: 'cat',
    breed: 'Британская короткошёрстная',
    birth_date: '2025-03-14',
    sex: 'male',
    photo_url: null,
    care_status: null,
    care_status_set_at: null,
    care_status_clinic: null,
    archived_at: null,
  },
]

export const unreadCount: Record<Role, number> = { owner: 3, clinic: 2, admin: 0 }
