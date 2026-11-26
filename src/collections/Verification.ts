import type { Access, CollectionConfig } from 'payload'

import { getCommunityRoles, isActive, isAdmin, orWhere } from '@/access/roles'

export const REQUEST_STATUSES = [
  'PENDING', // waiting for the CoP secretary to assign a reviewer/approver
  'UNDER_REVIEW',
  'REVISION_REQUIRED',
  'AWAITING_DECISION', // reviewer recommended; waiting for the approver
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

export const REVIEW_DECISIONS = [
  'REQUEST_REVISION',
  'RECOMMEND_APPROVAL',
  'RECOMMEND_REJECTION',
  'APPROVE',
  'REJECT',
  'REVOKE',
] as const
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number]

const denyAll = () => false
const readOnly = { readOnly: true }

/** Requester, assigned reviewer/approver, staff of the community and admins can read. */
const readRequests: Access = async ({ req }) => {
  if (isAdmin(req.user)) return true
  if (!isActive(req.user)) return false
  const roles = await getCommunityRoles(req)
  return orWhere(
    { requested_by: { equals: req.user.id } },
    { assigned_reviewer: { equals: req.user.id } },
    { assigned_approver: { equals: req.user.id } },
    roles.staffOf.length > 0 && { community: { in: roles.staffOf } },
  )
}

/**
 * Verification requests are created and transitioned only by the verification
 * service (custom endpoints), never through the generic REST/GraphQL create/update.
 */
export const VerificationRequests: CollectionConfig = {
  slug: 'verification-requests',
  labels: { singular: 'คำขอรับรองความรู้', plural: 'คำขอรับรองความรู้' },
  admin: {
    group: 'การรับรองความรู้',
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'community', 'submitted_at'],
    description: 'ดำเนินการผ่านหน้า /dashboard/verification — ข้อมูลในหน้านี้อ่านอย่างเดียว',
  },
  access: { read: readRequests, create: denyAll, update: denyAll, delete: denyAll },
  fields: [
    { name: 'title', type: 'text', admin: readOnly },
    { name: 'article', type: 'relationship', relationTo: 'articles', required: true, index: true, admin: readOnly },
    {
      name: 'article_version',
      type: 'text',
      admin: { ...readOnly, description: 'Payload version id ของบทความ ณ เวลาที่ส่งคำขอ' },
    },
    {
      name: 'snapshot',
      type: 'group',
      admin: { ...readOnly, description: 'Snapshot เนื้อหาที่ถูกตรวจ (ไม่เปลี่ยนแปลง)' },
      fields: [
        { name: 'title', type: 'text' },
        { name: 'subtitle', type: 'text' },
        { name: 'content', type: 'json' },
        { name: 'content_hash', type: 'text' },
        { name: 'captured_at', type: 'date' },
      ],
    },
    { name: 'community', type: 'relationship', relationTo: 'communities', required: true, index: true, admin: readOnly },
    {
      name: 'requested_by',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      admin: readOnly,
      access: { read: ({ req: { user } }) => isAdmin(user) },
    },
    { name: 'assigned_reviewer', type: 'relationship', relationTo: 'users', index: true, admin: readOnly },
    { name: 'assigned_approver', type: 'relationship', relationTo: 'users', index: true, admin: readOnly },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'PENDING',
      index: true,
      options: REQUEST_STATUSES.map((s) => ({ label: s, value: s })),
      admin: readOnly,
    },
    {
      name: 'reviewer_recommendation',
      type: 'select',
      options: ['RECOMMEND_APPROVAL', 'RECOMMEND_REJECTION'].map((s) => ({ label: s, value: s })),
      admin: readOnly,
    },
    { name: 'decision_note', type: 'textarea', admin: readOnly },
    { name: 'previous_request', type: 'relationship', relationTo: 'verification-requests', admin: readOnly },
    { name: 'submitted_at', type: 'date', required: true, admin: readOnly },
    { name: 'completed_at', type: 'date', admin: readOnly },
  ],
}

export const VerificationReviews: CollectionConfig = {
  slug: 'verification-reviews',
  labels: { singular: 'ผลการพิจารณา', plural: 'ผลการพิจารณา' },
  admin: { group: 'การรับรองความรู้', defaultColumns: ['verification_request', 'decision', 'reviewed_at'] },
  access: {
    read: async ({ req }) => {
      if (isAdmin(req.user)) return true
      if (!isActive(req.user)) return false
      const roles = await getCommunityRoles(req)
      return orWhere(
        { reviewer: { equals: req.user.id } },
        { 'verification_request.requested_by': { equals: req.user.id } },
        roles.staffOf.length > 0 && { 'verification_request.community': { in: roles.staffOf } },
      )
    },
    create: denyAll,
    update: denyAll,
    delete: denyAll,
  },
  fields: [
    {
      name: 'verification_request',
      type: 'relationship',
      relationTo: 'verification-requests',
      required: true,
      index: true,
      admin: readOnly,
    },
    { name: 'reviewer', type: 'relationship', relationTo: 'users', required: true, admin: readOnly },
    {
      name: 'role',
      type: 'select',
      options: ['COP_SECRETARY', 'COP_REVIEWER', 'COP_APPROVER', 'ADMIN'].map((s) => ({ label: s, value: s })),
      admin: readOnly,
    },
    {
      name: 'decision',
      type: 'select',
      required: true,
      options: REVIEW_DECISIONS.map((s) => ({ label: s, value: s })),
      admin: readOnly,
    },
    { name: 'review_comment', type: 'textarea', admin: readOnly },
    { name: 'reviewed_at', type: 'date', required: true, admin: readOnly },
  ],
}

export const VerificationHistory: CollectionConfig = {
  slug: 'verification-history',
  labels: { singular: 'ประวัติการรับรอง', plural: 'ประวัติการรับรอง' },
  admin: {
    group: 'การรับรองความรู้',
    defaultColumns: ['article', 'previous_status', 'new_status', 'createdAt'],
    description: 'Append-only — ไม่สามารถแก้ไขหรือลบได้ผ่านแอปพลิเคชัน',
  },
  access: {
    // Verification history is transparent to signed-in personnel (it holds no personal data beyond action_by,
    // which is restricted at field level).
    read: ({ req: { user } }) => isActive(user),
    create: denyAll,
    update: denyAll,
    delete: denyAll,
  },
  fields: [
    { name: 'article', type: 'relationship', relationTo: 'articles', required: true, index: true, admin: readOnly },
    { name: 'article_version', type: 'text', admin: readOnly },
    { name: 'verification_request', type: 'relationship', relationTo: 'verification-requests', index: true, admin: readOnly },
    { name: 'previous_status', type: 'text', admin: readOnly },
    { name: 'new_status', type: 'text', required: true, admin: readOnly },
    {
      name: 'action_by',
      type: 'relationship',
      relationTo: 'users',
      admin: readOnly,
      access: { read: ({ req: { user } }) => isAdmin(user) },
    },
    { name: 'action_note', type: 'textarea', admin: readOnly },
  ],
}
