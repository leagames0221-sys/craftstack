import { describe, expect, it } from 'vitest'
import { Role } from '@prisma/client'
import { roleAtLeast } from './rbac'

/**
 * Exhaustive 4x4 matrix: actual role vs required role.
 * `hasRole` / `requireRole` are integration-tested separately against
 * a real Prisma client in Week 4; here we verify the pure hierarchy logic.
 */
describe('roleAtLeast hierarchy (ADR-0003 RBAC)', () => {
  const roles: Role[] = ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER']

  const expected: Record<Role, Record<Role, boolean>> = {
    OWNER:  { OWNER: true,  ADMIN: true,  EDITOR: true,  VIEWER: true },
    ADMIN:  { OWNER: false, ADMIN: true,  EDITOR: true,  VIEWER: true },
    EDITOR: { OWNER: false, ADMIN: false, EDITOR: true,  VIEWER: true },
    VIEWER: { OWNER: false, ADMIN: false, EDITOR: false, VIEWER: true },
  }

  for (const actual of roles) {
    for (const required of roles) {
      it(`${actual} meets ${required}: ${expected[actual][required]}`, () => {
        expect(roleAtLeast(actual, required)).toBe(expected[actual][required])
      })
    }
  }
})
