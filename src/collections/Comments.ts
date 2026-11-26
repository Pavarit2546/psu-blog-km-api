import type { Access, CollectionConfig, FieldAccess, Where } from 'payload'
import { APIError } from 'payload'

import { getCommunityRoles, isActive, isAdmin, orWhere, relId } from '@/access/roles'
import { notify, writeAudit } from '@/lib/audit'
import { buildPublicAuthor, type AuthorDisplayMode } from '@/lib/publicAuthor'

export const COMMENT_RATE_LIMIT = { max: 5, windowMs: 60_000 }
export const COMMENT_MAX_LENGTH = 2000

const never: FieldAccess = () => false

/** Moderators: admins and secretaries of the article's community. */
export async function canModerateArticleComments(req: Parameters<Access>[0]['req'], articleCommunityId: string | null) {
  if (isAdmin(req.user)) return true
  if (!isActive(req.user) || !articleCommunityId) return false
  const roles = await getCommunityRoles(req)
  return roles.secretaryOf.includes(articleCommunityId)
}

const readComments: Access = async ({ req }) => {
  const { user } = req
  if (isAdmin(user)) return true
  const visibleOnPublic: Where = {
    and: [
      { status: { equals: 'VISIBLE' } },
      { 'article.publication_status': { equals: 'PUBLISHED' } },
      { 'article.visibility': { equals: 'PUBLIC' } },
    ],
  }
  if (!isActive(user)) return visibleOnPublic
  const roles = await getCommunityRoles(req)
  return orWhere(
    { and: [{ status: { not_equals: 'HIDDEN' } }, { 'article.publication_status': { equals: 'PUBLISHED' } }] },
    { author: { equals: user.id } },
    roles.secretaryOf.length > 0 && { 'article.community': { in: roles.secretaryOf } },
  )
}

const moderateAccess: Access = async ({ req }) => {
  if (!isActive(req.user)) return false
  if (isAdmin(req.user)) return true
  const roles = await getCommunityRoles(req)
  return orWhere(
    { author: { equals: req.user.id } },
    roles.secretaryOf.length > 0 && { 'article.community': { in: roles.secretaryOf } },
  )
}

export const Comments: CollectionConfig = {
  slug: 'comments',
  labels: { singular: 'ความคิดเห็น', plural: 'ความคิดเห็น' },
  admin: {
    group: 'ชุมชน',
    useAsTitle: 'content',
    defaultColumns: ['content', 'article', 'status', 'report_count', 'createdAt'],
  },
  access: {
    read: readComments,
    create: ({ req: { user } }) => isActive(user),
    update: moderateAccess,
    delete: moderateAccess,
  },
  hooks: {
    beforeChange: [
      async ({ data, req, operation, originalDoc, context }) => {
        if (context?.systemWrite) return data
        const user = req.user
        if (!isActive(user)) throw new APIError('ต้องเข้าสู่ระบบ', 401, undefined, true)

        if (operation === 'create') {
          data.author = user.id
          data.status = 'VISIBLE'
          data.report_count = 0

          const text = String(data.content ?? '').trim()
          if (!text) throw new APIError('กรุณาพิมพ์ความคิดเห็น', 400, undefined, true)
          data.content = text

          // Rate limit (DB-backed so it works across app instances).
          const since = new Date(Date.now() - COMMENT_RATE_LIMIT.windowMs).toISOString()
          const recent = await req.payload.count({
            collection: 'comments',
            where: { and: [{ author: { equals: user.id } }, { createdAt: { greater_than: since } }] },
            overrideAccess: true,
            req,
          })
          if (recent.totalDocs >= COMMENT_RATE_LIMIT.max) {
            throw new APIError('แสดงความคิดเห็นถี่เกินไป กรุณารอสักครู่', 429, undefined, true)
          }

          // The user must be able to read the article, and it must accept comments.
          const articleId = relId(data.article)
          if (!articleId) throw new APIError('ไม่พบบทความ', 400, undefined, true)
          const found = await req.payload.find({
            collection: 'articles',
            where: { id: { equals: articleId } },
            overrideAccess: false,
            user,
            req,
            depth: 0,
            limit: 1,
            select: { allow_comments: true, publication_status: true },
          })
          const article = found.docs[0]
          if (!article || article.publication_status !== 'PUBLISHED') {
            throw new APIError('ไม่พบบทความ', 404, undefined, true)
          }
          if (article.allow_comments === false) throw new APIError('บทความนี้ปิดการแสดงความคิดเห็น', 403, undefined, true)

          const parentId = relId(data.parent_comment)
          if (parentId) {
            const parent = await req.payload.findByID({ collection: 'comments', id: parentId, depth: 0, overrideAccess: true, req })
            if (relId(parent.article) !== articleId) throw new APIError('ความคิดเห็นหลักไม่ถูกต้อง', 400, undefined, true)
            // Keep threads one level deep.
            if (parent.parent_comment) data.parent_comment = relId(parent.parent_comment)
          }

          const author = await req.payload.findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true, req })
          const mode = (data.author_display ?? author.display_mode ?? 'REAL_NAME') as AuthorDisplayMode
          data.author_display = mode
          data.author_public = buildPublicAuthor(author, mode)
        } else {
          // Updates: authors may edit their own text; moderators may only change status.
          const isAuthor = relId(originalDoc?.author) === user.id
          const articleId = relId(originalDoc?.article)
          const article = articleId
            ? await req.payload.findByID({ collection: 'articles', id: articleId, depth: 0, overrideAccess: true, req })
            : null
          const isModerator = await canModerateArticleComments(req, relId(article?.community))
          if (!isModerator) data.status = originalDoc?.status
          if (!isAuthor) data.content = originalDoc?.content
          if (data.status && data.status !== originalDoc?.status) context.moderated = true
          if (typeof data.content === 'string') data.content = data.content.trim()
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, operation, req, context }) => {
        if (context?.systemWrite) return doc
        if (operation === 'create') {
          const article = await req.payload.findByID({
            collection: 'articles',
            id: relId(doc.article)!,
            depth: 0,
            overrideAccess: true,
            req,
          })
          await notify({
            req,
            recipients: [relId(article.author)],
            title: 'มีความคิดเห็นใหม่ในบทความของคุณ',
            message: `“${article.title}”`,
            type: 'COMMENT',
            articleId: String(article.id),
          })
        }
        if (context?.moderated) {
          delete context.moderated
          await writeAudit({
            req,
            action: `COMMENT_${doc.status}`,
            entityType: 'comments',
            entityId: String(doc.id),
          })
        }
        return doc
      },
    ],
  },
  fields: [
    { name: 'article', type: 'relationship', relationTo: 'articles', required: true, index: true },
    {
      name: 'content',
      label: 'ข้อความ',
      type: 'textarea',
      required: true,
      maxLength: COMMENT_MAX_LENGTH,
      admin: { description: 'ข้อความล้วน (ไม่รองรับ HTML) — แสดงผลแบบ escape เสมอ' },
    },
    { name: 'parent_comment', type: 'relationship', relationTo: 'comments', index: true },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'VISIBLE',
      index: true,
      options: [
        { label: 'แสดง', value: 'VISIBLE' },
        { label: 'ถูกรายงาน (รอตรวจ)', value: 'REPORTED' },
        { label: 'ซ่อน', value: 'HIDDEN' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      index: true,
      admin: { readOnly: true, position: 'sidebar' },
      access: {
        read: ({ req: { user }, doc }) => isAdmin(user) || (isActive(user) && relId(doc?.author) === user.id),
        create: never,
        update: never,
      },
    },
    {
      name: 'author_display',
      type: 'select',
      options: [
        { label: 'ชื่อจริง', value: 'REAL_NAME' },
        { label: 'นามปากกา', value: 'PEN_NAME' },
      ],
      access: { update: never },
      admin: { position: 'sidebar' },
    },
    {
      name: 'author_public',
      type: 'group',
      admin: { hidden: true },
      access: { create: never, update: never },
      fields: [
        { name: 'name', type: 'text' },
        { name: 'profile_key', type: 'text' },
        { name: 'avatar', type: 'text' },
        { name: 'department', type: 'text' },
        { name: 'position', type: 'text' },
        { name: 'is_pen_name', type: 'checkbox' },
      ],
    },
    {
      name: 'report_count',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true, position: 'sidebar' },
      access: { create: never, update: never },
    },
    {
      name: 'reported_by',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      admin: { hidden: true },
      access: { create: never, update: never, read: ({ req: { user } }) => isAdmin(user) },
    },
  ],
}
