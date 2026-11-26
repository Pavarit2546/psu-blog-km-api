import type { Block } from 'payload'

/** Hosts allowed for embedded external content. Anything else is rendered as a plain link. */
export const EMBED_ALLOWED_HOSTS = [
  'www.youtube.com',
  'youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
  'vimeo.com',
  'docs.google.com',
  'drive.google.com',
]

export const isAllowedEmbedHost = (host: string) =>
  EMBED_ALLOWED_HOSTS.includes(host) || host === 'psu.ac.th' || host.endsWith('.psu.ac.th')

export function validateEmbedUrl(value: unknown): true | string {
  if (typeof value !== 'string' || !value) return 'กรุณาระบุ URL'
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'URL ไม่ถูกต้อง'
  }
  if (url.protocol !== 'https:') return 'รองรับเฉพาะ https://'
  if (!isAllowedEmbedHost(url.hostname)) {
    return `ไม่อนุญาตให้ฝังเนื้อหาจาก ${url.hostname} (อนุญาต: YouTube, Vimeo, Google Docs/Drive, *.psu.ac.th)`
  }
  return true
}

export const EmbedBlock: Block = {
  slug: 'embed',
  labels: { singular: 'ฝังเนื้อหาภายนอก', plural: 'ฝังเนื้อหาภายนอก' },
  fields: [
    {
      name: 'url',
      label: 'URL (https)',
      type: 'text',
      required: true,
      validate: (value: unknown) => validateEmbedUrl(value),
    },
    { name: 'caption', label: 'คำบรรยาย', type: 'text', maxLength: 200 },
  ],
}
