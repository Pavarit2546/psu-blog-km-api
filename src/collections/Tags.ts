import type { CollectionConfig } from 'payload'

import { isActive, isAdmin } from '@/access/roles'
import { randomKey, slugify } from '@/lib/content'

export const Tags: CollectionConfig = {
  slug: 'tags',
  labels: { singular: 'แท็ก', plural: 'แท็ก' },
  admin: { useAsTitle: 'name', group: 'เนื้อหา', defaultColumns: ['name', 'slug'] },
  access: {
    read: () => true,
    create: ({ req: { user } }) => isActive(user),
    update: ({ req: { user } }) => isAdmin(user),
    delete: ({ req: { user } }) => isAdmin(user),
  },
  hooks: {
    beforeValidate: [
      ({ data, operation }) => {
        if (data && operation === 'create' && !data.slug && data.name) {
          data.slug = slugify(data.name) || `tag-${randomKey(4).toLowerCase()}`
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'name', label: 'ชื่อแท็ก', type: 'text', required: true, unique: true, maxLength: 60 },
    { name: 'slug', type: 'text', required: true, unique: true, index: true, admin: { position: 'sidebar' } },
    { name: 'description', label: 'คำอธิบาย', type: 'textarea', maxLength: 300 },
  ],
}
