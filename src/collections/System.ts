import type { CollectionConfig } from 'payload'

import { isActive, isAdmin } from '@/access/roles'

const denyAll = () => false

export const Notifications: CollectionConfig = {
  slug: 'notifications',
  labels: { singular: 'การแจ้งเตือน', plural: 'การแจ้งเตือน' },
  admin: { group: 'ระบบ', useAsTitle: 'title', hidden: ({ user }) => !isAdmin(user as never) },
  access: {
    read: ({ req: { user } }) => (isActive(user) ? { recipient: { equals: user.id } } : false),
    create: denyAll,
    // Recipients can only mark as read (other fields are locked below).
    update: ({ req: { user } }) => (isActive(user) ? { recipient: { equals: user.id } } : false),
    delete: ({ req: { user } }) => (isActive(user) ? { recipient: { equals: user.id } } : false),
  },
  fields: [
    { name: 'recipient', type: 'relationship', relationTo: 'users', required: true, index: true, access: { update: denyAll } },
    { name: 'title', type: 'text', required: true, access: { update: denyAll } },
    { name: 'message', type: 'textarea', access: { update: denyAll } },
    {
      name: 'notification_type',
      type: 'select',
      options: ['VERIFICATION', 'COMMENT', 'COMMUNITY', 'SYSTEM', 'MODERATION'].map((v) => ({ label: v, value: v })),
      access: { update: denyAll },
    },
    { name: 'related_article', type: 'relationship', relationTo: 'articles', access: { update: denyAll } },
    { name: 'read_at', type: 'date', index: true },
  ],
}

export const AuditLogs: CollectionConfig = {
  slug: 'audit-logs',
  labels: { singular: 'Audit log', plural: 'Audit logs' },
  admin: {
    group: 'ระบบ',
    useAsTitle: 'action',
    defaultColumns: ['action', 'entity_type', 'entity_id', 'actor', 'timestamp'],
    hidden: ({ user }) => !isAdmin(user as never),
    description: 'Append-only — บันทึกการกระทำ ไม่บันทึกข้อมูลส่วนบุคคล',
  },
  access: {
    read: ({ req: { user } }) => isAdmin(user),
    create: denyAll,
    update: denyAll,
    delete: denyAll,
  },
  fields: [
    { name: 'actor', type: 'relationship', relationTo: 'users', index: true },
    { name: 'action', type: 'text', required: true, index: true },
    { name: 'entity_type', type: 'text', required: true, index: true },
    { name: 'entity_id', type: 'text', index: true },
    { name: 'metadata', type: 'json' },
    { name: 'timestamp', type: 'date', required: true, index: true },
  ],
}

export const Bookmarks: CollectionConfig = {
  slug: 'bookmarks',
  labels: { singular: 'บุ๊กมาร์ก', plural: 'บุ๊กมาร์ก' },
  admin: { group: 'ระบบ', hidden: true },
  access: {
    read: ({ req: { user } }) => (isActive(user) ? { user: { equals: user.id } } : false),
    create: ({ req: { user } }) => isActive(user),
    update: denyAll,
    delete: ({ req: { user } }) => (isActive(user) ? { user: { equals: user.id } } : false),
  },
  indexes: [{ fields: ['user', 'article'], unique: true }],
  hooks: {
    beforeChange: [
      ({ data, req }) => {
        data.user = req.user?.id
        return data
      },
    ],
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'article', type: 'relationship', relationTo: 'articles', required: true, index: true },
  ],
}
