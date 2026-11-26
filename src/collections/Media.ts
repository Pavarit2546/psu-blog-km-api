import type { CollectionConfig } from 'payload'

import { isActive, isAdmin, relId } from '@/access/roles'

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]

/** 10 MB per file; enforced again globally in payload.config `upload.limits`. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'ไฟล์สื่อ', plural: 'ไฟล์สื่อ' },
  admin: {
    group: 'เนื้อหา',
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'media_type', 'alt', 'updatedAt'],
  },
  access: {
    // Images (cover/featured/inline) are public; documents/attachments need a PSU login.
    read: ({ req: { user } }) => (isActive(user) ? true : { media_type: { equals: 'IMAGE' } }),
    create: ({ req: { user } }) => isActive(user),
    update: ({ req: { user } }) => {
      if (!isActive(user)) return false
      if (isAdmin(user)) return true
      return { uploaded_by: { equals: user.id } }
    },
    delete: ({ req: { user } }) => {
      if (!isActive(user)) return false
      if (isAdmin(user)) return true
      return { uploaded_by: { equals: user.id } }
    },
  },
  upload: {
    // SVG is intentionally excluded (script-capable format).
    mimeTypes: [...IMAGE_MIME_TYPES, ...DOCUMENT_MIME_TYPES],
    focalPoint: true,
    imageSizes: [
      { name: 'thumbnail', width: 480, height: 320, position: 'centre', formatOptions: { format: 'webp', options: { quality: 80 } } },
      { name: 'card', width: 960, height: 540, position: 'centre', formatOptions: { format: 'webp', options: { quality: 80 } } },
      { name: 'hero', width: 1800, withoutEnlargement: true, formatOptions: { format: 'webp', options: { quality: 82 } } },
    ],
    adminThumbnail: 'thumbnail',
    // Used only when MinIO/S3 is disabled (development fallback). Must be a persistent volume.
    staticDir: process.env.MEDIA_DIR || 'media',
  },
  hooks: {
    beforeChange: [
      ({ data, req, operation }) => {
        if (operation === 'create') {
          data.uploaded_by = relId(req.user) ?? data.uploaded_by
        }
        if (data.mimeType) {
          data.media_type = String(data.mimeType).startsWith('image/') ? 'IMAGE' : 'DOCUMENT'
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'alt', label: 'ข้อความแทนภาพ (alt)', type: 'text', maxLength: 250 },
    { name: 'caption', label: 'คำบรรยาย', type: 'text', maxLength: 300 },
    {
      name: 'media_type',
      type: 'select',
      defaultValue: 'IMAGE',
      options: [
        { label: 'รูปภาพ', value: 'IMAGE' },
        { label: 'เอกสาร', value: 'DOCUMENT' },
      ],
      index: true,
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'uploaded_by',
      type: 'relationship',
      relationTo: 'users',
      index: true,
      admin: { readOnly: true, position: 'sidebar' },
      access: {
        read: ({ req: { user } }) => isAdmin(user),
        update: () => false,
      },
    },
  ],
}
