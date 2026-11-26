import type { Endpoint, PayloadHandler, PayloadRequest } from 'payload'
import {
  APIError,
  addDataAndFileToRequest,
  commitTransaction,
  initTransaction,
  killTransaction,
} from 'payload'
import { sql } from '@payloadcms/db-postgres'

import { isActive, isAdmin, relId, relIds } from '@/access/roles'
import { notify, writeAudit } from '@/lib/audit'
import { searchArticles } from '@/lib/search'
import {
  assignRequest,
  cancelRequest,
  decideRequest,
  requestVerification,
  reviewRequest,
  revokeVerification,
} from '@/lib/verification/service'
import type { User } from '@/payload-types'
import { errorResponse, json } from './http'
import { kmEndpoints } from './km'

const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : undefined)
const id = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined)

/** Wrap a mutation in a DB transaction; parse JSON body; require login. */
const mutation =
  (fn: (req: PayloadRequest, body: Record<string, unknown>) => Promise<unknown>): PayloadHandler =>
  async (req) => {
    if (!isActive(req.user)) return json({ errors: [{ message: 'ต้องเข้าสู่ระบบ' }] }, 401)
    try {
      await addDataAndFileToRequest(req)
      const body = (req.data ?? {}) as Record<string, unknown>
      const shouldCommit = await initTransaction(req)
      try {
        const result = await fn(req, body)
        if (shouldCommit) await commitTransaction(req)
        return json({ ok: true, doc: result })
      } catch (error) {
        await killTransaction(req)
        throw error
      }
    } catch (error) {
      return errorResponse(req, error)
    }
  }

const requireId = (v: unknown, name: string) => {
  const value = id(v)
  if (!value) throw new APIError(`${name} ไม่ถูกต้อง`, 400, undefined, true)
  return value
}

export const endpoints: Endpoint[] = [
  ...kmEndpoints,
  {
    path: '/health',
    method: 'get',
    handler: async (req) => {
      try {
        const db = (req.payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } }).drizzle
        await db.execute(sql`SELECT 1`)
        return json({ status: 'ok' })
      } catch {
        return json({ status: 'error' }, 503)
      }
    },
  },
  // ---------------- verification workflow ----------------
  {
    path: '/verification/request',
    method: 'post',
    handler: mutation((req, b) =>
      requestVerification(req, {
        articleId: requireId(b.articleId, 'articleId'),
        communityId: id(b.communityId),
        note: str(b.note),
      }),
    ),
  },
  {
    path: '/verification/assign',
    method: 'post',
    handler: mutation((req, b) =>
      assignRequest(req, {
        requestId: requireId(b.requestId, 'requestId'),
        reviewerId: requireId(b.reviewerId, 'reviewerId'),
        approverId: requireId(b.approverId, 'approverId'),
      }),
    ),
  },
  {
    path: '/verification/review',
    method: 'post',
    handler: mutation((req, b) =>
      reviewRequest(req, {
        requestId: requireId(b.requestId, 'requestId'),
        decision: str(b.decision, 40) as never,
        comment: str(b.comment),
      }),
    ),
  },
  {
    path: '/verification/decide',
    method: 'post',
    handler: mutation((req, b) =>
      decideRequest(req, {
        requestId: requireId(b.requestId, 'requestId'),
        decision: str(b.decision, 20) as never,
        note: str(b.note),
      }),
    ),
  },
  {
    path: '/verification/revoke',
    method: 'post',
    handler: mutation((req, b) =>
      revokeVerification(req, { articleId: requireId(b.articleId, 'articleId'), reason: str(b.reason) }),
    ),
  },
  {
    path: '/verification/cancel',
    method: 'post',
    handler: mutation((req, b) => cancelRequest(req, { requestId: requireId(b.requestId, 'requestId') })),
  },
  // ---------------- communities ----------------
  {
    path: '/community-membership',
    method: 'post',
    handler: mutation(async (req, b) => {
      const communityId = requireId(b.communityId, 'communityId')
      const action = b.action === 'leave' ? 'leave' : 'join'
      const user = req.user as User
      const community = await req.payload.findByID({
        collection: 'communities',
        id: communityId,
        depth: 0,
        overrideAccess: true,
        req,
      })
      if (community.status !== 'ACTIVE') throw new APIError('ชุมชนนี้ปิดการใช้งาน', 409, undefined, true)
      const members = relIds(community.members)
      const next = action === 'join' ? Array.from(new Set([...members, user.id])) : members.filter((m) => m !== user.id)
      await req.payload.update({
        collection: 'communities',
        id: communityId,
        data: { members: next },
        overrideAccess: true,
        req,
        context: { systemWrite: true },
      })
      await writeAudit({ req, action: `COMMUNITY_${action.toUpperCase()}`, entityType: 'communities', entityId: communityId })
      if (action === 'join') {
        await notify({
          req,
          recipients: relIds(community.secretary),
          title: 'มีสมาชิกใหม่เข้าร่วมชุมชน',
          message: community.name,
          type: 'COMMUNITY',
        })
      }
      return { communityId, member: action === 'join' }
    }),
  },
  // ---------------- comments moderation ----------------
  {
    path: '/comment-report',
    method: 'post',
    handler: mutation(async (req, b) => {
      const commentId = requireId(b.commentId, 'commentId')
      const user = req.user as User
      // Must be able to read the comment.
      const found = await req.payload.find({
        collection: 'comments',
        where: { id: { equals: commentId } },
        overrideAccess: false,
        user,
        req,
        depth: 0,
        limit: 1,
      })
      if (!found.docs[0]) throw new APIError('ไม่พบความคิดเห็น', 404, undefined, true)
      const comment = await req.payload.findByID({ collection: 'comments', id: commentId, depth: 0, overrideAccess: true, req })
      const reporters = relIds(comment.reported_by)
      if (reporters.includes(user.id)) return { reported: true, duplicate: true }
      const reportCount = (comment.report_count ?? 0) + 1
      await req.payload.update({
        collection: 'comments',
        id: commentId,
        data: {
          reported_by: [...reporters, user.id],
          report_count: reportCount,
          // Auto-hide pending moderation after 3 independent reports.
          status: reportCount >= 3 ? 'HIDDEN' : comment.status === 'VISIBLE' ? 'REPORTED' : comment.status,
        },
        overrideAccess: true,
        req,
        context: { systemWrite: true },
      })
      const article = await req.payload.findByID({
        collection: 'articles',
        id: relId(comment.article)!,
        depth: 0,
        overrideAccess: true,
        req,
      })
      const community = relId(article.community)
        ? await req.payload.findByID({ collection: 'communities', id: relId(article.community)!, depth: 0, overrideAccess: true, req })
        : null
      await notify({
        req,
        recipients: community ? relIds(community.secretary) : [],
        title: 'มีการรายงานความคิดเห็นที่ไม่เหมาะสม',
        message: `ในบทความ “${article.title}”`,
        type: 'MODERATION',
        articleId: String(article.id),
      })
      await writeAudit({ req, action: 'COMMENT_REPORTED', entityType: 'comments', entityId: commentId, metadata: { reportCount } })
      return { reported: true }
    }),
  },
  // ---------------- search ----------------
  {
    path: '/search',
    method: 'get',
    handler: async (req) => {
      try {
        const q = String(req.searchParams.get('q') ?? '').slice(0, 200)
        const limit = Number(req.searchParams.get('limit') ?? 20)
        const result = await searchArticles({
          payload: req.payload,
          user: (req.user as User) ?? null,
          query: q,
          limit: Number.isFinite(limit) ? limit : 20,
        })
        return json(result)
      } catch (error) {
        return errorResponse(req, error)
      }
    },
  },
  // ---------------- statistics ----------------
  {
    path: '/platform-stats',
    method: 'get',
    handler: async (req) => {
      if (!isAdmin(req.user)) return json({ errors: [{ message: 'ไม่มีสิทธิ์เข้าถึง' }] }, 403)
      try {
        const { getPlatformStats } = await import('@/lib/stats')
        return json(await getPlatformStats(req.payload))
      } catch (error) {
        return errorResponse(req, error)
      }
    },
  },
]
