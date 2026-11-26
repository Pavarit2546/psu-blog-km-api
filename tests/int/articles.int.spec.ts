import { describe, expect, it } from 'vitest'

import { doc, p } from '@/seed/lexical'
import { communityId, createArticle, demoUser, payloadClient, reqAs } from './helpers'

const visibleTo = async (id: string, user: Awaited<ReturnType<typeof demoUser>> | null) => {
  const payload = await payloadClient()
  const r = await payload.find({
    collection: 'articles',
    where: { id: { equals: id } },
    overrideAccess: false,
    user: user ?? undefined,
    depth: 0,
  })
  return r.docs.length === 1
}

describe('Articles', () => {
  it('creates a draft that only the author can see', async () => {
    const draft = await createArticle('personnel', { status: 'DRAFT' })
    expect(draft.publication_status).toBe('DRAFT')
    expect(draft.published_at).toBeFalsy()
    expect(await visibleTo(String(draft.id), await demoUser('personnel'))).toBe(true)
    expect(await visibleTo(String(draft.id), await demoUser('writer'))).toBe(false)
    expect(await visibleTo(String(draft.id), null)).toBe(false)
  })

  it('publishes immediately without approval (Community Blog)', async () => {
    const payload = await payloadClient()
    const req = await reqAs('personnel')
    const draft = await createArticle('personnel', { status: 'DRAFT' })
    const published = await payload.update({
      collection: 'articles',
      id: draft.id,
      data: { publication_status: 'PUBLISHED' },
      req,
      user: req.user,
      overrideAccess: false,
    })
    expect(published.publication_status).toBe('PUBLISHED')
    expect(published.published_at).toBeTruthy()
    expect(published.publication_type).toBe('COMMUNITY')
    expect(published.verification_status).toBe('NOT_SUBMITTED')
    expect(await visibleTo(String(draft.id), null)).toBe(true)
  })

  it('lets the author edit their own article', async () => {
    const payload = await payloadClient()
    const req = await reqAs('personnel')
    const a = await createArticle('personnel')
    const updated = await payload.update({
      collection: 'articles',
      id: a.id,
      data: { title: 'ชื่อใหม่', content: doc(p('เนื้อหาใหม่')) as never },
      req,
      user: req.user,
      overrideAccess: false,
    })
    expect(updated.title).toBe('ชื่อใหม่')
  })

  it("prevents a user from editing another user's article", async () => {
    const payload = await payloadClient()
    const a = await createArticle('personnel')
    const req = await reqAs('writer')
    await expect(
      payload.update({ collection: 'articles', id: a.id, data: { title: 'ถูกแก้โดยคนอื่น' }, req, user: req.user, overrideAccess: false }),
    ).rejects.toThrow()
  })

  it('ignores client attempts to set system fields (verification status, author, featured)', async () => {
    const payload = await payloadClient()
    const req = await reqAs('personnel')
    const other = await demoUser('writer')
    const a = await payload.create({
      collection: 'articles',
      data: {
        title: 'พยายามปลอมสถานะ',
        content: doc(p('x')) as never,
        publication_status: 'PUBLISHED',
        verification_status: 'VERIFIED',
        publication_type: 'ORGANIZATIONAL_KNOWLEDGE',
        featured: true,
        author: other.id,
      } as never,
      req,
      user: req.user,
      overrideAccess: false,
    })
    const raw = await payload.findByID({ collection: 'articles', id: a.id, overrideAccess: true, depth: 0 })
    expect(raw.verification_status).toBe('NOT_SUBMITTED')
    expect(raw.publication_type).toBe('COMMUNITY')
    expect(raw.featured).toBe(false)
    expect(raw.author).toBe(req.user!.id)
  })

  it('archives an article (no longer listed as published)', async () => {
    const payload = await payloadClient()
    const req = await reqAs('personnel')
    const a = await createArticle('personnel')
    await payload.update({ collection: 'articles', id: a.id, data: { publication_status: 'ARCHIVED' }, req, user: req.user, overrideAccess: false })
    expect(await visibleTo(String(a.id), null)).toBe(false)
    expect(await visibleTo(String(a.id), await demoUser('personnel'))).toBe(true)
  })

  it('lets a CoP secretary archive but not rewrite a community article', async () => {
    const payload = await payloadClient()
    const a = await createArticle('personnel', { community: await communityId() })
    const req = await reqAs('secretary')
    await payload.update({
      collection: 'articles',
      id: a.id,
      data: { title: 'เลขาแก้ชื่อ', publication_status: 'ARCHIVED' },
      req,
      user: req.user,
      overrideAccess: false,
    })
    const raw = await payload.findByID({ collection: 'articles', id: a.id, overrideAccess: true })
    expect(raw.publication_status).toBe('ARCHIVED')
    expect(raw.title).toBe(a.title)
  })

  it('hides INTERNAL articles from anonymous readers but not from personnel', async () => {
    const a = await createArticle('personnel', { visibility: 'INTERNAL' })
    expect(await visibleTo(String(a.id), null)).toBe(false)
    expect(await visibleTo(String(a.id), await demoUser('writer'))).toBe(true)
  })
})
