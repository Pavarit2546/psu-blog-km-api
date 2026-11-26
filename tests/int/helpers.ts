import type { Payload, PayloadRequest } from 'payload'
import { createLocalReq, getPayload } from 'payload'

import config from '@/payload.config'
import type { User } from '@/payload-types'
import { demoEmail, type DemoKey } from '@/seed/index'
import { doc, p } from '@/seed/lexical'

let cached: Payload | null = null
export async function payloadClient() {
  if (!cached) cached = await getPayload({ config })
  return cached
}

export async function demoUser(key: DemoKey): Promise<User> {
  const payload = await payloadClient()
  const { docs } = await payload.find({ collection: 'users', where: { email: { equals: demoEmail(key) } }, overrideAccess: true, limit: 1 })
  if (!docs[0]) throw new Error(`demo user ${key} missing`)
  return docs[0]
}

export async function reqAs(key: DemoKey): Promise<PayloadRequest> {
  const payload = await payloadClient()
  const user = await demoUser(key)
  return createLocalReq({ user: { ...user, collection: 'users' } as never }, payload)
}

export async function communityId(slug = 'hr-management') {
  const payload = await payloadClient()
  const { docs } = await payload.find({ collection: 'communities', where: { slug: { equals: slug } }, overrideAccess: true })
  return String(docs[0].id)
}

/** Create an article through the access-controlled Local API as the given user. */
export async function createArticle(
  key: DemoKey,
  data: Partial<{ title: string; body: string; status: 'DRAFT' | 'PUBLISHED'; visibility: 'PUBLIC' | 'INTERNAL'; community: string; author_display: 'REAL_NAME' | 'PEN_NAME' }> = {},
) {
  const payload = await payloadClient()
  const req = await reqAs(key)
  return payload.create({
    collection: 'articles',
    data: {
      title: data.title ?? `บทความทดสอบ ${Math.random().toString(36).slice(2, 8)}`,
      content: doc(p(data.body ?? 'เนื้อหาทดสอบสำหรับระบบอัตโนมัติ')) as never,
      publication_status: data.status ?? 'PUBLISHED',
      visibility: data.visibility ?? 'PUBLIC',
      community: data.community,
      author_display: data.author_display,
    },
    req,
    user: req.user,
    overrideAccess: false,
  })
}

export const PASSWORD = () => process.env.SEED_DEMO_PASSWORD!

export async function closePayload() {
  if (cached) await cached.destroy()
  cached = null
}
