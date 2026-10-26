import type { Role } from '../api/schema'

export const unreadCount: Record<Role, number> = { owner: 3, clinic: 2, admin: 0 }
