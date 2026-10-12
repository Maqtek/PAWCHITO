import type { Role } from '../api/schema'

export type MockRole = Role | 'guest'

const ROLE_KEY = 'pawchito:mock-role'
const ROLES: MockRole[] = ['owner', 'clinic', 'admin', 'guest']

export function getMockRole(): MockRole {
  try {
    const value = localStorage.getItem(ROLE_KEY)
    return ROLES.find((role) => role === value) ?? 'owner'
  } catch {
    return 'owner'
  }
}

export function setMockRole(role: MockRole): void {
  try {
    localStorage.setItem(ROLE_KEY, role)
  } catch {
    // приватный режим: роль останется по умолчанию
  }
}

export function tokenFor(role: Role): string {
  return `mock-access.${role}`
}

export function roleFromRequest(request: Request): Role | null {
  const match = /^Bearer mock-access\.(owner|clinic|admin)$/.exec(request.headers.get('Authorization') ?? '')
  return match ? (match[1] as Role) : null
}
