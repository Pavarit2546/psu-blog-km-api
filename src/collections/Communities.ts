import type { CollectionConfig, FieldAccess } from 'payload'

import { getCommunityRoles, isActive, isAdmin } from '@/access/roles'
import { writeAudit } from '@/lib/audit'
import { slugify, randomKey } from '@/lib/content'

const adminOnlyField: FieldAccess = ({ req: { user } }) => isAdmin(user)
const loggedInField: FieldAccess = ({ req: { user } }) => isActive(user)

export const Communities: CollectionConfig = {
  slug: 'communities',
  labels: { singular: 'ชุมชนนักปฏิบัติ (CoP)', plural: 'ชุมชนนักปฏิบัติ (CoP)' },
  admin: {
    useAsTitle: 'name',
    group: 'ชุมชน',
    defaultColumns: ['name', 'slug', 'status', 'updatedAt'],
  },
  access: {
    read: ({ req: { user } }) => (isAdmin(user) ? true : { status: { equals: 'ACTIVE' } }),
    create: ({ req: { user } }) => isAdmin(user),
    // Secretaries manage their own community (member and role lists, description).
    update: async ({ req }) => {
      if (!isActive(req.user)) return false
      if (isAdmin(req.user)) return true
      const roles = await getCommunityRoles(req)
      return roles.secretaryOf.length ? { id: { in: roles.secretaryOf } } : false
    },
    delete: ({ req: { user } }) => isAdmin(user),
  },
  hooks: {
    beforeValidate: [
      ({ data, operation }) => {
        if (data && operation === 'create' && !data.slug && data.name) {
          data.slug = slugify(data.name) || `cop-${randomKey(4).toLowerCase()}`
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, operation, req, context }) => {
        if (context?.systemWrite) return doc
        const changed = ['secretary', 'reviewers', 'approvers'].filter(
          (f) => JSON.stringify(previousDoc?.[f] ?? []) !== JSON.stringify(doc[f] ?? []),
        )
        if (operation === 'create' || changed.length) {
          await writeAudit({
            req,
            action: operation === 'create' ? 'COMMUNITY_CREATED' : 'COMMUNITY_ROLES_CHANGED',
            entityType: 'communities',
            entityId: String(doc.id),
            metadata: { changed },
          })
        }
        return doc
      },
    ],
  },
  fields: [
    { name: 'name', label: 'ชื่อชุมชน', type: 'text', required: true, maxLength: 120, access: { update: adminOnlyField } },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { position: 'sidebar' },
      access: { update: adminOnlyField },
    },
    { name: 'description', label: 'คำอธิบาย', type: 'textarea', maxLength: 1000 },
    { name: 'cover_image', label: 'ภาพปก', type: 'upload', relationTo: 'media' },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'ACTIVE',
      options: [
        { label: 'เปิดใช้งาน', value: 'ACTIVE' },
        { label: 'ปิด/เก็บถาวร', value: 'ARCHIVED' },
      ],
      admin: { position: 'sidebar' },
      access: { update: adminOnlyField },
    },
    {
      type: 'collapsible',
      label: 'สมาชิกและบทบาท',
      fields: [
        {
          name: 'secretary',
          label: 'เลขานุการ CoP (COP_SECRETARY)',
          type: 'relationship',
          relationTo: 'users',
          hasMany: true,
          access: { read: loggedInField, update: adminOnlyField, create: adminOnlyField },
        },
        {
          name: 'reviewers',
          label: 'ผู้ตรวจทาน (COP_REVIEWER)',
          type: 'relationship',
          relationTo: 'users',
          hasMany: true,
          access: { read: loggedInField },
        },
        {
          name: 'approvers',
          label: 'ผู้อนุมัติ (COP_APPROVER)',
          type: 'relationship',
          relationTo: 'users',
          hasMany: true,
          access: { read: loggedInField },
        },
        {
          name: 'members',
          label: 'สมาชิก',
          type: 'relationship',
          relationTo: 'users',
          hasMany: true,
          access: { read: loggedInField },
        },
      ],
    },
  ],
  timestamps: true,
}
