import type { PayloadRequest, Where } from 'payload'

import type { User } from '@/payload-types'

export const GLOBAL_ROLES = ['PSU_PERSONNEL', 'HR_ADMIN', 'SUPER_ADMIN'] as const
export type GlobalRole = (typeof GLOBAL_ROLES)[number]

export const COMMUNITY_ROLES = ['COP_SECRETARY', 'COP_REVIEWER', 'COP_APPROVER'] as const
export type CommunityRole = (typeof COMMUNITY_ROLES)[number]

type MaybeUser = Pick<User, 'id' | 'global_roles' | 'status'> | null | undefined

/** Normalise a relationship value (id or populated doc) to its id. */
export const relId = (value: unknown): string | null => {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    return String((value as { id: unknown }).id)
  }
  return null
}

export const relIds = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(relId).filter((v): v is string => Boolean(v)) : []

export const isActive = (user: MaybeUser): user is NonNullable<MaybeUser> =>
  Boolean(user && user.status !== 'SUSPENDED')

export const hasRole = (user: MaybeUser, ...roles: GlobalRole[]): boolean =>
  isActive(user) && Array.isArray(user.global_roles) && user.global_roles.some((r) => roles.includes(r as GlobalRole))

export const isSuperAdmin = (user: MaybeUser) => hasRole(user, 'SUPER_ADMIN')
export const isAdmin = (user: MaybeUser) => hasRole(user, 'HR_ADMIN', 'SUPER_ADMIN')

export type CommunityRoleMap = {
  communities: { id: string; name: string }[]
  memberOf: string[]
  secretaryOf: string[]
  reviewerOf: string[]
  approverOf: string[]
  /** Communities where the user holds any staff role. */
  staffOf: string[]
}

const EMPTY_ROLES: CommunityRoleMap = {
  communities: [],
  memberOf: [],
  secretaryOf: [],
  reviewerOf: [],
  approverOf: [],
  staffOf: [],
}

/**
 * Resolve the community-specific roles of the request user.
 * Cached on req.context so access functions can call it repeatedly.
 */
export async function getCommunityRoles(req: PayloadRequest): Promise<CommunityRoleMap> {
  const user = req.user as MaybeUser
  if (!isActive(user)) return EMPTY_ROLES
  const cacheKey = `__communityRoles_${user.id}`
  const cached = req.context?.[cacheKey] as CommunityRoleMap | undefined
  if (cached) return cached

  const { docs } = await req.payload.find({
    collection: 'communities',
    where: {
      or: [
        { members: { contains: user.id } },
        { secretary: { contains: user.id } },
        { reviewers: { contains: user.id } },
        { approvers: { contains: user.id } },
      ],
    },
    depth: 0,
    limit: 500,
    pagination: false,
    overrideAccess: true,
    req,
    select: { name: true, members: true, secretary: true, reviewers: true, approvers: true },
  })

  const roles: CommunityRoleMap = { communities: [], memberOf: [], secretaryOf: [], reviewerOf: [], approverOf: [], staffOf: [] }
  for (const c of docs) {
    const id = String(c.id)
    roles.communities.push({ id, name: c.name })
    if (relIds(c.members).includes(user.id)) roles.memberOf.push(id)
    if (relIds(c.secretary).includes(user.id)) roles.secretaryOf.push(id)
    if (relIds(c.reviewers).includes(user.id)) roles.reviewerOf.push(id)
    if (relIds(c.approvers).includes(user.id)) roles.approverOf.push(id)
  }
  roles.staffOf = Array.from(new Set([...roles.secretaryOf, ...roles.reviewerOf, ...roles.approverOf]))
  if (req.context) req.context[cacheKey] = roles
  return roles
}

/** Combine where clauses with OR, dropping empty branches. */
export const orWhere = (...clauses: (Where | null | undefined | false)[]): Where => {
  const list = clauses.filter(Boolean) as Where[]
  if (list.length === 1) return list[0]
  return { or: list }
}
