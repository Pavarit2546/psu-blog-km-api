import type { Access, CollectionConfig, FieldAccess, Where } from 'payload'
import { APIError } from 'payload'
import {
  BlocksFeature,
  FixedToolbarFeature,
  HorizontalRuleFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

import { getCommunityRoles, isActive, isAdmin, orWhere, relId, relIds } from '@/access/roles'
import { EmbedBlock } from '@/blocks/Embed'
import { writeAudit } from '@/lib/audit'
import { computeContentHash, lexicalToPlainText, makeArticleSlug, makeExcerpt } from '@/lib/content'
import { buildPublicAuthor, type AuthorDisplayMode } from '@/lib/publicAuthor'
import { recordHistory } from '@/lib/verification/history'
import { webURL } from '@/lib/webURL'

export const PUBLICATION_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const
export const VERIFICATION_STATUSES = [
  'NOT_SUBMITTED',
  'PENDING',
  'UNDER_REVIEW',
  'REVISION_REQUIRED',
  'VERIFIED',
  'REJECTED',
  'REVOKED',
  // Added: verified content changed significantly and must be verified again.
  'REVERIFICATION_REQUIRED',
] as const

const never: FieldAccess = () => false
const adminOnly: FieldAccess = ({ req: { user } }) => isAdmin(user)
const authorOrAdmin: FieldAccess = ({ req: { user }, doc }) =>
  isAdmin(user) || (isActive(user) && relId(doc?.author) === user.id)

/**
 * Read rules
 *  - anonymous: PUBLISHED + PUBLIC
 *  - PSU personnel: any PUBLISHED article (PUBLIC or INTERNAL), plus their own articles,
 *    plus every article of communities where they are secretary/reviewer/approver
 *  - HR_ADMIN / SUPER_ADMIN: everything
 */
export const readArticles: Access = async ({ req }) => {
  const { user } = req
  if (isAdmin(user)) return true
  const publicPublished: Where = {
    and: [{ publication_status: { equals: 'PUBLISHED' } }, { visibility: { equals: 'PUBLIC' } }],
  }
  if (!isActive(user)) return publicPublished
  const roles = await getCommunityRoles(req)
  return orWhere(
    { publication_status: { equals: 'PUBLISHED' } },
    { author: { equals: user.id } },
    roles.staffOf.length > 0 && { community: { in: roles.staffOf } },
  )
}

const updateArticles: Access = async ({ req }) => {
  const { user } = req
  if (!isActive(user)) return false
  if (isAdmin(user)) return true
  const roles = await getCommunityRoles(req)
  return orWhere(
    { author: { equals: user.id } },
    roles.secretaryOf.length > 0 && { community: { in: roles.secretaryOf } },
  )
}

const deleteArticles: Access = ({ req: { user } }) => {
  if (!isActive(user)) return false
  if (isAdmin(user)) return true
  // Authors may only delete their own drafts that never entered verification (history must be preserved).
  const own: Where = {
    and: [
      { author: { equals: user.id } },
      { publication_status: { equals: 'DRAFT' } },
      { verification_status: { equals: 'NOT_SUBMITTED' } },
    ],
  }
  return own
}

export const Articles: CollectionConfig = {
  slug: 'articles',
  labels: { singular: 'บทความ', plural: 'บทความ' },
  admin: {
    useAsTitle: 'title',
    group: 'เนื้อหา',
    defaultColumns: ['title', 'publication_status', 'verification_status', 'visibility', 'updatedAt'],
    listSearchableFields: ['title', 'subtitle', 'excerpt'],
    preview: (doc) =>
      doc?.slug ? `${webURL}/articles/${encodeURIComponent(String(doc.slug))}` : null,
    description:
      'เขียนและเผยแพร่บทความได้ทันที (Community Blog) — การรับรองความรู้ (PSU Verified) เป็นขั้นตอนแยกต่างหาก',
  },
  versions: {
    maxPerDoc: 100,
  },
  access: {
    read: readArticles,
    create: ({ req: { user } }) => isActive(user),
    update: updateArticles,
    delete: deleteArticles,
    readVersions: async ({ req }) => {
      if (isAdmin(req.user)) return true
      if (!isActive(req.user)) return false
      const roles = await getCommunityRoles(req)
      return orWhere(
        { 'version.author': { equals: req.user.id } },
        roles.staffOf.length > 0 && { 'version.community': { in: roles.staffOf } },
      )
    },
  },
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, operation, req, context }) => {
        const user = req.user
        // --- ownership ---------------------------------------------------
        if (operation === 'create') {
          if (!data.author || !isAdmin(user)) data.author = relId(user) ?? data.author
          if (!data.author) throw new APIError('ต้องเข้าสู่ระบบก่อนสร้างบทความ', 401, undefined, true)
          data.slug = data.slug || makeArticleSlug(data.title ?? '')
          data.verification_status = 'NOT_SUBMITTED'
          data.publication_type = 'COMMUNITY'
        }

        // Community secretaries may moderate (archive / restore) articles in their community
        // but must not edit another author's content.
        if (
          operation === 'update' &&
          !context?.systemWrite &&
          user &&
          !isAdmin(user) &&
          relId(originalDoc?.author) !== relId(user)
        ) {
          for (const key of Object.keys(data)) {
            if (key !== 'publication_status') data[key] = originalDoc?.[key]
          }
          const from = originalDoc?.publication_status
          const to = data.publication_status
          const allowed = to === from || to === 'ARCHIVED' || (from === 'ARCHIVED' && to === 'PUBLISHED')
          if (!allowed) throw new APIError('เลขานุการ CoP ทำได้เฉพาะเก็บถาวร/คืนสถานะบทความ', 403, undefined, true)
        }

        const merged = { ...originalDoc, ...data }

        // --- author projection (supports pen names) ---------------------
        const authorId = relId(merged.author)
        const authorChanged = operation === 'create' || relId(originalDoc?.author) !== authorId
        const displayChanged = originalDoc?.author_display !== merged.author_display
        if (authorId && (authorChanged || displayChanged || !originalDoc?.author_public?.profile_key)) {
          const author = await req.payload.findByID({
            collection: 'users',
            id: authorId,
            depth: 0,
            overrideAccess: true,
            req,
          })
          if (operation === 'create' && !data.author_display) {
            data.author_display = author.display_mode ?? 'REAL_NAME'
            merged.author_display = data.author_display
          }
          data.author_public = buildPublicAuthor(author, (merged.author_display ?? 'REAL_NAME') as AuthorDisplayMode)
          merged.author_public = data.author_public
        }

        // --- publication ------------------------------------------------
        if (merged.publication_status === 'PUBLISHED' && !merged.published_at) {
          data.published_at = new Date().toISOString()
        }

        // --- derived content fields ------------------------------------
        const plain = lexicalToPlainText(merged.content)
        if (!merged.excerpt?.trim()) data.excerpt = makeExcerpt(plain)
        data.content_hash = computeContentHash(merged)

        // --- significant change after verification ----------------------
        if (
          operation === 'update' &&
          !context?.skipVerificationCheck &&
          originalDoc?.verification_status === 'VERIFIED' &&
          originalDoc.verified_content_hash &&
          data.content_hash !== originalDoc.verified_content_hash
        ) {
          data.verification_status = 'REVERIFICATION_REQUIRED'
          data.publication_type = 'COMMUNITY'
          context.verificationInvalidated = true
        }

        // --- search document ---------------------------------------------
        const tagIds = relIds(merged.tags)
        const tagNames = tagIds.length
          ? (
              await req.payload.find({
                collection: 'tags',
                where: { id: { in: tagIds } },
                depth: 0,
                limit: 50,
                overrideAccess: true,
                req,
                select: { name: true },
              })
            ).docs.map((t) => t.name)
          : []
        const communityId = relId(merged.community)
        const communityName = communityId
          ? (
              await req.payload.findByID({
                collection: 'communities',
                id: communityId,
                depth: 0,
                overrideAccess: true,
                req,
                select: { name: true },
              })
            ).name
          : ''
        data.search_text = [
          merged.title,
          merged.subtitle,
          data.excerpt ?? merged.excerpt,
          tagNames.join(' '),
          merged.author_public?.name,
          communityName,
          plain.slice(0, 20000),
        ]
          .filter(Boolean)
          .join('\n')
        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, operation, req, context }) => {
        if (context?.verificationInvalidated) {
          delete context.verificationInvalidated // req.context is shared by every operation in this request
          await recordHistory({
            req,
            articleId: String(doc.id),
            requestId: relId(doc.current_verified_version),
            previousStatus: 'VERIFIED',
            newStatus: 'REVERIFICATION_REQUIRED',
            note: 'เนื้อหาเปลี่ยนแปลงอย่างมีนัยสำคัญหลังการรับรอง ต้องขอรับรองใหม่',
          })
          await writeAudit({
            req,
            action: 'VERIFICATION_INVALIDATED_BY_EDIT',
            entityType: 'articles',
            entityId: String(doc.id),
          })
        }
        if (!context?.systemWrite && (operation === 'create' || previousDoc?.publication_status !== doc.publication_status)) {
          await writeAudit({
            req,
            action: operation === 'create' ? 'ARTICLE_CREATED' : `ARTICLE_${doc.publication_status}`,
            entityType: 'articles',
            entityId: String(doc.id),
            metadata: { publication_status: doc.publication_status, visibility: doc.visibility },
          })
        }
        return doc
      },
    ],
  },
  fields: [
    { name: 'title', label: 'ชื่อเรื่อง', type: 'text', required: true, maxLength: 200 },
    { name: 'subtitle', label: 'คำโปรย', type: 'text', maxLength: 250 },
    {
      name: 'content',
      label: 'เนื้อหา',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures,
          FixedToolbarFeature(),
          HorizontalRuleFeature(),
          BlocksFeature({ blocks: [EmbedBlock] }),
        ],
      }),
    },
    {
      type: 'collapsible',
      label: 'ภาพและไฟล์แนบ',
      fields: [
        { name: 'featured_image', label: 'ภาพปก', type: 'upload', relationTo: 'media' },
        {
          name: 'attachments',
          label: 'ไฟล์แนบ (PDF / Office, ≤ 10 MB)',
          type: 'upload',
          relationTo: 'media',
          hasMany: true,
          maxRows: 10,
        },
      ],
    },
    {
      name: 'excerpt',
      label: 'บทคัดย่อ (เว้นว่างเพื่อสร้างอัตโนมัติ)',
      type: 'textarea',
      maxLength: 400,
    },
    // ---------------- sidebar -------------------------------------------
    {
      name: 'publication_status',
      label: 'สถานะการเผยแพร่',
      type: 'select',
      required: true,
      defaultValue: 'DRAFT',
      index: true,
      options: [
        { label: 'ฉบับร่าง (Draft)', value: 'DRAFT' },
        { label: 'เผยแพร่ (Published)', value: 'PUBLISHED' },
        { label: 'เก็บถาวร (Archived)', value: 'ARCHIVED' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'visibility',
      label: 'การมองเห็น',
      type: 'select',
      required: true,
      defaultValue: 'INTERNAL',
      index: true,
      options: [
        { label: 'ภายใน มอ. (ต้องเข้าสู่ระบบ)', value: 'INTERNAL' },
        { label: 'สาธารณะ', value: 'PUBLIC' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'community',
      label: 'ชุมชน (CoP)',
      type: 'relationship',
      relationTo: 'communities',
      index: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'tags',
      label: 'แท็ก',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
      maxRows: 10,
      admin: { position: 'sidebar' },
    },
    {
      name: 'author_display',
      label: 'แสดงชื่อผู้เขียนเป็น',
      type: 'select',
      options: [
        { label: 'ชื่อจริง / ชื่อที่แสดง', value: 'REAL_NAME' },
        { label: 'นามปากกา', value: 'PEN_NAME' },
      ],
      admin: { position: 'sidebar', description: 'ระบบยังคงบันทึกตัวตนจริงของผู้เขียนไว้ภายใน' },
    },
    {
      name: 'allow_comments',
      label: 'อนุญาตให้แสดงความคิดเห็น',
      type: 'checkbox',
      defaultValue: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'verification_panel',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: { Field: '@/components/admin/VerificationPanel#VerificationPanel' },
      },
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      admin: { position: 'sidebar', readOnly: true },
      access: { update: adminOnly },
    },
    // ---------------- system-managed --------------------------------------
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      index: true,
      admin: { position: 'sidebar', readOnly: true, description: 'ตัวตนจริง (ไม่เปิดเผยต่อสาธารณะ)' },
      access: { read: authorOrAdmin, create: adminOnly, update: adminOnly },
    },
    {
      name: 'author_public',
      type: 'group',
      admin: { hidden: true },
      access: { create: never, update: never },
      fields: [
        { name: 'name', type: 'text' },
        { name: 'profile_key', type: 'text', index: true },
        { name: 'avatar', type: 'text' },
        { name: 'department', type: 'text' },
        { name: 'position', type: 'text' },
        { name: 'is_pen_name', type: 'checkbox' },
      ],
    },
    {
      name: 'publication_type',
      label: 'ประเภท',
      type: 'select',
      defaultValue: 'COMMUNITY',
      options: [
        { label: 'Community Blog', value: 'COMMUNITY' },
        { label: 'Organizational Knowledge (PSU Verified)', value: 'ORGANIZATIONAL_KNOWLEDGE' },
      ],
      admin: { position: 'sidebar', readOnly: true },
      access: { create: never, update: never },
    },
    {
      name: 'verification_status',
      label: 'สถานะการรับรอง',
      type: 'select',
      defaultValue: 'NOT_SUBMITTED',
      index: true,
      options: VERIFICATION_STATUSES.map((s) => ({ label: s, value: s })),
      admin: { position: 'sidebar', readOnly: true },
      access: { create: never, update: never },
    },
    {
      name: 'featured',
      label: 'บทความแนะนำ (หน้าแรก)',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: { position: 'sidebar' },
      access: { create: adminOnly, update: adminOnly },
    },
    {
      type: 'collapsible',
      label: 'ข้อมูลระบบ (อ่านอย่างเดียว)',
      admin: { initCollapsed: true },
      fields: [
        { name: 'published_at', type: 'date', index: true, admin: { readOnly: true }, access: { create: never, update: never } },
        { name: 'verified_at', type: 'date', admin: { readOnly: true }, access: { create: never, update: never } },
        {
          name: 'verified_by',
          type: 'relationship',
          relationTo: 'users',
          admin: { readOnly: true },
          access: { create: never, update: never, read: ({ req: { user } }) => isActive(user) },
        },
        {
          name: 'current_verified_version',
          type: 'relationship',
          relationTo: 'verification-requests',
          admin: { readOnly: true, description: 'คำขอรับรองที่อนุมัติล่าสุด (เก็บ snapshot เนื้อหาที่ได้รับการรับรอง)' },
          access: { create: never, update: never },
        },
        {
          name: 'active_verification_request',
          type: 'relationship',
          relationTo: 'verification-requests',
          admin: { readOnly: true },
          access: { create: never, update: never },
        },
        { name: 'verified_content_hash', type: 'text', admin: { readOnly: true }, access: { create: never, update: never } },
        { name: 'content_hash', type: 'text', admin: { readOnly: true }, access: { create: never, update: never } },
        { name: 'view_count', type: 'number', defaultValue: 0, index: true, admin: { readOnly: true }, access: { create: never, update: never } },
        {
          name: 'search_text',
          type: 'textarea',
          admin: { hidden: true },
          access: { create: never, update: never, read: () => false },
        },
      ],
    },
  ],
}
