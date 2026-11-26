import { sql } from '@payloadcms/db-postgres'
import { APIError, type Endpoint, type PayloadHandler, type PayloadRequest, type Where } from 'payload'

import { getCommunityRoles, isActive, isSuperAdmin, relId, relIds } from '@/access/roles'
import { buildPublicAuthor } from '@/lib/publicAuthor'
import { errorResponse, json } from './http'

function notFound(): never {
  throw new APIError('ไม่พบข้อมูล', 404, undefined, true)
}

function routeID(req: PayloadRequest): string {
  const id = req.routeParams?.id
  if (typeof id !== 'string' || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)) notFound()
  return id
}

function sessionUser(req: PayloadRequest) {
  if (!isActive(req.user)) throw new APIError('ต้องเข้าสู่ระบบ', 401, undefined, true)
  return req.user
}

const handle = (fn: (req: PayloadRequest) => Promise<unknown>): PayloadHandler => async (req) => {
  try {
    return json(await fn(req))
  } catch (error) {
    return errorResponse(req, error)
  }
}

async function roles(req: PayloadRequest) {
  const { communities, secretaryOf, reviewerOf, approverOf } = await getCommunityRoles(req)
  // The site's membership list includes communities where the person holds a staff role.
  return { memberOf: communities.map((c) => c.id), secretaryOf, reviewerOf, approverOf, communities }
}

async function communities(req: PayloadRequest) {
  const slug = req.searchParams.get('slug')
  const limit = Number(req.searchParams.get('limit') ?? 100)
  const sort = req.searchParams.get('sort') === 'name' ? 'name' : undefined
  const where: Where = { status: { equals: 'ACTIVE' } }
  if (slug !== null) where.slug = { equals: slug }
  const signedIn = isActive(req.user)
  // Fixed fields from active communities. Membership leaves this handler only as a count and a boolean.
  const { docs } = await req.payload.find({
    collection: 'communities', req, where, sort, depth: 0, overrideAccess: true,
    limit: Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.floor(limit))) : 100,
    select: {
      name: true, slug: true, description: true, cover_image: true, members: true,
      secretary: true, reviewers: true, approvers: true,
    },
  })
  const staffIDs = signedIn ? [...new Set(docs.flatMap((c) => [
    ...relIds(c.secretary), ...relIds(c.reviewers), ...relIds(c.approvers),
  ]))] : []
  const coverIDs = [...new Set(docs.map((c) => relId(c.cover_image)).filter((id): id is string => Boolean(id)))]
  const [staff, covers] = await Promise.all([
    staffIDs.length ? req.payload.find({
      collection: 'users', where: { id: { in: staffIDs } }, req, depth: 0, limit: staffIDs.length,
      overrideAccess: true, select: { name: true, display_name: true },
    }) : { docs: [] },
    coverIDs.length ? req.payload.find({
      collection: 'media', where: { id: { in: coverIDs } }, req, depth: 0, limit: coverIDs.length,
      overrideAccess: false, select: { url: true, sizes: true, alt: true },
    }) : { docs: [] },
  ])
  const staffByID = new Map(staff.docs.map(({ id, name, display_name }) => [id, { id, name, display_name }]))
  const coverByID = new Map(covers.docs.map(({ id, url, sizes, alt }) => [id, { id, url, sizes, alt }]))
  const names = (values: unknown) => relIds(values).flatMap((id) => staffByID.get(id) ?? [])
  return {
    docs: docs.map((c) => {
      const members = relIds(c.members)
      return {
        id: c.id, name: c.name, slug: c.slug, description: c.description ?? null,
        cover_image: coverByID.get(relId(c.cover_image) ?? '') ?? null,
        memberCount: members.length, isMember: signedIn && members.includes(req.user!.id),
        secretary: names(c.secretary), reviewers: names(c.reviewers), approvers: names(c.approvers),
      }
    }),
  }
}

async function author(req: PayloadRequest) {
  const key = req.routeParams?.key
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{6,64}$/.test(key)) notFound()
  const { docs: [person] } = await req.payload.find({
    collection: 'users', req, depth: 0, limit: 1, overrideAccess: true,
    where: { and: [{ status: { equals: 'ACTIVE' } }, { or: [{ public_key: { equals: key } }, { pen_key: { equals: key } }] }] },
    select: {
      name: true, display_name: true, pen_name: true, public_key: true, pen_key: true, bio: true,
      avatar: true, department: true, position: true, show_department: true,
    },
  })
  if (!person) notFound()
  const isPen = person.pen_key === key
  const profile = buildPublicAuthor(person, isPen ? 'PEN_NAME' : 'REAL_NAME')
  if (isPen) return { profile, isPen, bio: null, avatar: null, communities: [] }
  const [memberships, media] = await Promise.all([
    req.payload.find({
      collection: 'communities', req, depth: 0, pagination: false, overrideAccess: true,
      where: {
        status: { equals: 'ACTIVE' },
        or: [
          { members: { contains: person.id } }, { secretary: { contains: person.id } },
          { reviewers: { contains: person.id } }, { approvers: { contains: person.id } },
        ],
      },
      select: { name: true },
    }),
    profile.avatar ? req.payload.find({
      collection: 'media', req, depth: 0, limit: 1, overrideAccess: false,
      where: { id: { equals: profile.avatar } }, select: { url: true, sizes: true },
    }) : { docs: [] },
  ])
  const image = media.docs[0]
  return {
    profile, isPen, bio: person.bio ?? null, avatar: image?.sizes?.thumbnail?.url || image?.url || null,
    communities: memberships.docs.map(({ id, name }) => ({ id, name })),
  }
}

async function verified(req: PayloadRequest) {
  const id = routeID(req)
  const { docs: [article] } = await req.payload.find({
    collection: 'articles', req, depth: 0, limit: 1, overrideAccess: false,
    where: { id: { equals: id } }, select: { current_verified_version: true },
  })
  const version = relId(article?.current_verified_version)
  if (!version) notFound()
  // Only the approved request referenced by the visible article can cross the request read boundary.
  const { docs: [request] } = await req.payload.find({
    collection: 'verification-requests', req, depth: 1, limit: 1, overrideAccess: true,
    where: { id: { equals: version }, article: { equals: id }, status: { equals: 'APPROVED' } },
    select: { snapshot: true, community: true, article_version: true, completed_at: true },
    populate: { communities: { name: true, slug: true } },
  })
  if (!request) notFound()
  const community = typeof request.community === 'object' ? request.community : null
  return {
    snapshot: request.snapshot, completed_at: request.completed_at, article_version: request.article_version,
    community: community ? { id: community.id, name: community.name, slug: community.slug } : null,
  }
}

async function recordView(req: PayloadRequest) {
  const id = routeID(req)
  const { docs: [article] } = await req.payload.find({
    collection: 'articles', req, depth: 0, limit: 1, overrideAccess: false,
    where: { id: { equals: id }, publication_status: { equals: 'PUBLISHED' } }, select: { publication_status: true },
  })
  if (!article) notFound()
  // Recheck publication/visibility in the atomic increment in case the article changed after the read.
  const result = await req.payload.db.drizzle.execute(sql`
    UPDATE articles SET view_count = COALESCE(view_count, 0) + 1
    WHERE id = ${id} AND publication_status = 'PUBLISHED'
      AND (${isActive(req.user)} OR visibility = 'PUBLIC')
    RETURNING id
  `)
  if (!result.rows.length) notFound()
  return { ok: true }
}

async function assignmentOptions(req: PayloadRequest) {
  sessionUser(req)
  const id = routeID(req)
  const { secretaryOf } = await getCommunityRoles(req)
  const where: Where = { id: { equals: id } }
  if (!isSuperAdmin(req.user)) {
    if (!secretaryOf.length) throw new APIError('ไม่มีสิทธิ์เข้าถึง', 403, undefined, true)
    where.community = { in: secretaryOf }
  }
  const { docs: [request] } = await req.payload.find({
    collection: 'verification-requests', req, where, limit: 1, depth: 0, overrideAccess: true,
    select: { requested_by: true, community: true },
  })
  if (!request) notFound()
  const community = await req.payload.findByID({
    collection: 'communities', id: relId(request.community)!, req, depth: 1, overrideAccess: true,
    select: { reviewers: true, approvers: true }, populate: { users: { name: true, display_name: true } },
  })
  const requester = relId(request.requested_by)
  const options = (people: typeof community.reviewers) => (people ?? []).flatMap((person) =>
    typeof person === 'object' && person.id !== requester ? [{ id: person.id, name: person.display_name || person.name }] : [],
  )
  return { reviewers: options(community.reviewers), approvers: options(community.approvers) }
}

async function dashboardMine(req: PayloadRequest) {
  const user = sessionUser(req)
  const [articles, requests] = await Promise.all([
    req.payload.find({
      collection: 'articles', req, where: { author: { equals: user.id } }, overrideAccess: true,
      depth: 0, limit: 100, sort: '-updatedAt',
      select: { title: true, slug: true, publication_status: true, verification_status: true, updatedAt: true, view_count: true },
    }),
    req.payload.find({
      collection: 'verification-requests', req, where: { requested_by: { equals: user.id } }, overrideAccess: true,
      depth: 1, limit: 20, sort: '-submitted_at',
      select: { title: true, status: true, submitted_at: true, decision_note: true, community: true, article: true },
      populate: { communities: { name: true }, articles: { slug: true } },
    }),
  ])
  return { articles: { docs: articles.docs, totalDocs: articles.totalDocs }, requests: { docs: requests.docs } }
}

export const kmEndpoints: Endpoint[] = [
  { path: '/km/roles', method: 'get', handler: handle(roles) },
  { path: '/km/communities', method: 'get', handler: handle(communities) },
  { path: '/km/authors/:key', method: 'get', handler: handle(author) },
  { path: '/km/articles/:id/verified', method: 'get', handler: handle(verified) },
  { path: '/km/articles/:id/view', method: 'post', handler: handle(recordView) },
  { path: '/km/requests/:id/options', method: 'get', handler: handle(assignmentOptions) },
  { path: '/km/dashboard-mine', method: 'get', handler: handle(dashboardMine) },
]
