import type { Access, CollectionConfig, FieldAccess } from 'payload'
import { APIError } from 'payload'

import { GLOBAL_ROLES, getCommunityRoles, isActive, isAdmin, isSuperAdmin, relId } from '@/access/roles'
import { randomKey } from '@/lib/content'
import { buildPublicAuthor, type AuthorDisplayMode } from '@/lib/publicAuthor'
import { writeAudit } from '@/lib/audit'

const selfOrAdminField: FieldAccess = ({ req: { user }, id }) =>
  isAdmin(user) || (Boolean(user) && relId(user) === (id ? String(id) : undefined))

const adminOnlyField: FieldAccess = ({ req: { user } }) => isAdmin(user)
const neverWritable: FieldAccess = () => false

/**
 * Users can read: themselves; HR/Super admins: everyone;
 * community secretaries: everyone (needed to assign members/reviewers).
 * Private fields are additionally protected with field-level access.
 */
const readUsers: Access = async ({ req }) => {
  const { user } = req
  if (!isActive(user)) return false
  if (isAdmin(user)) return true
  const roles = await getCommunityRoles(req)
  if (roles.secretaryOf.length > 0) return true
  return { id: { equals: user.id } }
}

const PUBLIC_PROFILE_FIELDS = [
  'name',
  'display_name',
  'pen_name',
  'avatar',
  'department',
  'position',
  'show_department',
] as const

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'ผู้ใช้', plural: 'ผู้ใช้' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'department', 'global_roles', 'status'],
    group: 'ระบบ',
    hidden: ({ user }) => !isAdmin(user as never),
  },
  auth: {
    tokenExpiration: 60 * 60 * 8, // 8 hours
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
    cookies: {
      sameSite: 'Lax',
      secure: process.env.COOKIE_SECURE === 'true',
    },
  },
  access: {
    admin: ({ req: { user } }) => isActive(user),
    read: readUsers,
    create: ({ req: { user } }) => isAdmin(user),
    update: ({ req: { user } }) => {
      if (!isActive(user)) return false
      if (isAdmin(user)) return true
      return { id: { equals: user.id } }
    },
    delete: ({ req: { user } }) => isSuperAdmin(user),
    unlock: ({ req: { user } }) => isAdmin(user),
  },
  hooks: {
    afterRead: [
      // The auth email is added by Payload; hide it from anyone except the user and admins
      // (e.g. community secretaries who can list users for role assignment).
      ({ doc, req }) => {
        if (req.user && !isAdmin(req.user) && relId(req.user) !== String(doc.id)) {
          delete doc.email
        }
        return doc
      },
    ],
    beforeLogin: [
      ({ user }) => {
        if (user?.status === 'SUSPENDED') {
          throw new APIError('บัญชีนี้ถูกระงับการใช้งาน', 403, undefined, true)
        }
        return user
      },
    ],
    beforeChange: [
      ({ data, req, operation, originalDoc }) => {
        // Keys used for public (real-name / pen-name) profiles. Never derived from the user id.
        if (operation === 'create' || !originalDoc?.public_key) data.public_key = data.public_key || randomKey()
        if (operation === 'create' || !originalDoc?.pen_key) data.pen_key = data.pen_key || randomKey()
        if (operation === 'create' && (!data.global_roles || data.global_roles.length === 0)) {
          data.global_roles = ['PSU_PERSONNEL']
        }
        // Only a SUPER_ADMIN may grant or remove SUPER_ADMIN.
        const before: string[] = originalDoc?.global_roles ?? []
        const after: string[] = data.global_roles ?? before
        if (before.includes('SUPER_ADMIN') !== after.includes('SUPER_ADMIN') && req.user && !isSuperAdmin(req.user)) {
          throw new APIError('เฉพาะ SUPER_ADMIN เท่านั้นที่กำหนดสิทธิ์ SUPER_ADMIN ได้', 403, undefined, true)
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req, operation, context }) => {
        if (context?.skipAuthorRefresh) return doc
        if (operation === 'update') {
          const roleChanged = JSON.stringify(previousDoc?.global_roles) !== JSON.stringify(doc.global_roles)
          if (roleChanged || previousDoc?.status !== doc.status) {
            await writeAudit({
              req,
              action: roleChanged ? 'USER_ROLES_CHANGED' : 'USER_STATUS_CHANGED',
              entityType: 'users',
              entityId: String(doc.id),
              metadata: { roles: doc.global_roles, status: doc.status },
            })
          }
          const profileChanged = PUBLIC_PROFILE_FIELDS.some(
            (f) => JSON.stringify(relId(previousDoc?.[f]) ?? previousDoc?.[f]) !== JSON.stringify(relId(doc[f]) ?? doc[f]),
          )
          if (profileChanged) {
            // Refresh the denormalised public author projection on this user's articles and comments.
            for (const collection of ['articles', 'comments'] as const) {
              const { docs } = await req.payload.find({
                collection,
                where: { author: { equals: doc.id } },
                depth: 0,
                limit: 1000,
                pagination: false,
                overrideAccess: true,
                req,
                select: { author_display: true },
              })
              for (const item of docs) {
                await req.payload.update({
                  collection,
                  id: item.id,
                  data: {
                    author_public: buildPublicAuthor(doc, (item.author_display ?? 'REAL_NAME') as AuthorDisplayMode),
                  },
                  overrideAccess: true,
                  req,
                  context: { systemWrite: true, skipVerificationCheck: true },
                })
              }
            }
          }
        }
        return doc
      },
    ],
  },
  fields: [
    { name: 'name', label: 'ชื่อ-นามสกุลจริง', type: 'text', required: true, maxLength: 120 },
    {
      name: 'employee_id',
      label: 'รหัสบุคลากร (ข้อมูลส่วนบุคคล)',
      type: 'text',
      index: true,
      admin: { description: 'ข้อมูลส่วนบุคคล — ไม่เปิดเผยผ่าน public API' },
      access: { read: selfOrAdminField, create: adminOnlyField, update: adminOnlyField },
    },
    {
      type: 'row',
      fields: [
        { name: 'department', label: 'หน่วยงาน', type: 'text', maxLength: 150 },
        { name: 'position', label: 'ตำแหน่ง', type: 'text', maxLength: 150 },
      ],
    },
    {
      name: 'show_department',
      label: 'แสดงหน่วยงาน/ตำแหน่งในโปรไฟล์สาธารณะ',
      type: 'checkbox',
      defaultValue: false,
    },
    { name: 'avatar', label: 'รูปโปรไฟล์', type: 'upload', relationTo: 'media' },
    { name: 'bio', label: 'แนะนำตัว', type: 'textarea', maxLength: 600 },
    {
      type: 'row',
      fields: [
        { name: 'display_name', label: 'ชื่อที่แสดง', type: 'text', maxLength: 80 },
        { name: 'pen_name', label: 'นามปากกา', type: 'text', maxLength: 80 },
      ],
    },
    {
      name: 'display_mode',
      label: 'รูปแบบการแสดงชื่อเริ่มต้นสำหรับบทความใหม่',
      type: 'select',
      defaultValue: 'REAL_NAME',
      options: [
        { label: 'ชื่อจริง / ชื่อที่แสดง', value: 'REAL_NAME' },
        { label: 'นามปากกา', value: 'PEN_NAME' },
      ],
    },
    {
      name: 'global_roles',
      label: 'บทบาทระดับระบบ',
      type: 'select',
      hasMany: true,
      defaultValue: ['PSU_PERSONNEL'],
      options: GLOBAL_ROLES.map((r) => ({ label: r, value: r })),
      saveToJWT: true,
      access: { create: adminOnlyField, update: adminOnlyField, read: selfOrAdminField },
    },
    {
      name: 'status',
      label: 'สถานะบัญชี',
      type: 'select',
      defaultValue: 'ACTIVE',
      options: [
        { label: 'ใช้งาน', value: 'ACTIVE' },
        { label: 'ระงับ', value: 'SUSPENDED' },
      ],
      saveToJWT: true,
      access: { create: adminOnlyField, update: adminOnlyField, read: selfOrAdminField },
    },
    {
      name: 'public_key',
      type: 'text',
      unique: true,
      index: true,
      admin: { readOnly: true, position: 'sidebar', description: 'คีย์โปรไฟล์สาธารณะ (ชื่อจริง)' },
      access: { create: neverWritable, update: neverWritable, read: selfOrAdminField },
    },
    {
      name: 'pen_key',
      type: 'text',
      unique: true,
      index: true,
      admin: { readOnly: true, position: 'sidebar', description: 'คีย์โปรไฟล์นามปากกา' },
      access: { create: neverWritable, update: neverWritable, read: selfOrAdminField },
    },
  ],
}
