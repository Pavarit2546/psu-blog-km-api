import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { relId } from '@/access/roles'
import { searchArticles } from '@/lib/search'
import { createArticle, demoUser, payloadClient, reqAs } from './helpers'

describe('Comments', () => {
  it('stores comments as plain text and builds threads one level deep', async () => {
    const payload = await payloadClient()
    const a = await createArticle('personnel')
    const req = await reqAs('writer')
    const root = await payload.create({
      collection: 'comments',
      data: { article: a.id, content: '<script>alert(1)</script> สวัสดี' },
      req,
      user: req.user,
      overrideAccess: false,
    })
    expect(root.content).toBe('<script>alert(1)</script> สวัสดี') // rendered escaped by React, never as HTML
    expect(root.author_public?.name).toBeTruthy()
    const reply = await payload.create({ collection: 'comments', data: { article: a.id, content: 'ตอบ', parent_comment: root.id }, req, user: req.user, overrideAccess: false })
    const nested = await payload.create({ collection: 'comments', data: { article: a.id, content: 'ซ้อน', parent_comment: reply.id }, req, user: req.user, overrideAccess: false })
    expect(relId(nested.parent_comment)).toBe(String(root.id))
  })

  it('rate-limits rapid commenting', async () => {
    const payload = await payloadClient()
    const a = await createArticle('personnel')
    const req = await reqAs('hradmin')
    for (let i = 0; i < 5; i++) {
      await payload.create({ collection: 'comments', data: { article: a.id, content: `c${i}` }, req, user: req.user, overrideAccess: false })
    }
    await expect(
      payload.create({ collection: 'comments', data: { article: a.id, content: 'spam' }, req, user: req.user, overrideAccess: false }),
    ).rejects.toThrow(/ถี่/)
  })

  it('anonymous users cannot comment; comments disabled are enforced', async () => {
    const payload = await payloadClient()
    const a = await createArticle('personnel')
    await expect(payload.create({ collection: 'comments', data: { article: a.id, content: 'x' }, overrideAccess: false })).rejects.toThrow()
    const req = await reqAs('personnel')
    await payload.update({ collection: 'articles', id: a.id, data: { allow_comments: false }, req, user: req.user, overrideAccess: false })
    const w = await reqAs('approver')
    await expect(
      payload.create({ collection: 'comments', data: { article: a.id, content: 'x' }, req: w, user: w.user, overrideAccess: false }),
    ).rejects.toThrow()
  })

  it('only moderators can hide comments', async () => {
    const payload = await payloadClient()
    const a = await createArticle('personnel', { community: undefined })
    const req = await reqAs('writer')
    const c = await payload.create({ collection: 'comments', data: { article: a.id, content: 'x' }, req, user: req.user, overrideAccess: false })
    const authorEdit = await payload.update({ collection: 'comments', id: c.id, data: { status: 'HIDDEN' }, req, user: req.user, overrideAccess: false })
    expect(authorEdit.status).toBe('VISIBLE') // the comment author is not a moderator
    const hr = await reqAs('hradmin')
    const hidden = await payload.update({ collection: 'comments', id: c.id, data: { status: 'HIDDEN' }, req: hr, user: hr.user, overrideAccess: false })
    expect(hidden.status).toBe('HIDDEN')
  })
})

describe('Search (PostgreSQL keyword search)', () => {
  it('finds published articles by Thai substring, tag and author name', async () => {
    const payload = await payloadClient()
    const unique = `คำค้นพิเศษ${Date.now()}`
    await createArticle('personnel', { title: `บทความเรื่อง ${unique}` })
    const r = await searchArticles({ payload, user: null, query: unique })
    expect(r.hits).toHaveLength(1)
    expect(r.hits[0].author_public?.name).toBeTruthy()
    const byTag = await searchArticles({ payload, user: null, query: 'สวัสดิการ' })
    expect(byTag.hits.length).toBeGreaterThan(0)
  })

  it('respects visibility and publication status', async () => {
    const payload = await payloadClient()
    const word = `ลับเฉพาะ${Date.now()}`
    await createArticle('personnel', { title: `ภายใน ${word}`, visibility: 'INTERNAL' })
    await createArticle('personnel', { title: `ร่าง ${word}`, status: 'DRAFT' })
    expect((await searchArticles({ payload, user: null, query: word })).hits).toHaveLength(0)
    const staff = await searchArticles({ payload, user: await demoUser('writer'), query: word })
    expect(staff.hits.map((h) => h.title)).toEqual([`ภายใน ${word}`])
  })

  it('treats SQL/LIKE metacharacters as literal text', async () => {
    const payload = await payloadClient()
    const r = await searchArticles({ payload, user: null, query: "%' OR 1=1 --" })
    expect(r.hits).toHaveLength(0)
  })
})

describe('Storage (MinIO via @payloadcms/storage-s3)', () => {
  it('uploads an image and stores generated sizes', async () => {
    const payload = await payloadClient()
    const req = await reqAs('personnel')
    const data = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#0b3b6f' } }).png().toBuffer()
    const media = await payload.create({
      collection: 'media',
      data: { alt: 'ทดสอบ' },
      file: { data, mimetype: 'image/png', name: `int-test-${Date.now()}.png`, size: data.length },
      req,
      user: req.user,
      overrideAccess: false,
    })
    expect(media.media_type).toBe('IMAGE')
    expect(media.url).toContain('/api/media/file/')
    expect(media.sizes?.thumbnail?.filename).toBeTruthy()
    const raw = await payload.findByID({ collection: 'media', id: media.id, overrideAccess: true })
    expect(relId(raw.uploaded_by)).toBe(req.user!.id)
  })

  it('rejects files whose content does not match an allowed type (spoofed extension)', async () => {
    const payload = await payloadClient()
    const req = await reqAs('personnel')
    const data = Buffer.from('<html><script>alert(1)</script></html>')
    await expect(
      payload.create({
        collection: 'media',
        data: { alt: 'x' },
        file: { data, mimetype: 'image/png', name: 'evil.png', size: data.length },
        req,
        user: req.user,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('rejects SVG uploads', async () => {
    const payload = await payloadClient()
    const req = await reqAs('personnel')
    const data = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    await expect(
      payload.create({
        collection: 'media',
        data: { alt: 'x' },
        file: { data, mimetype: 'image/svg+xml', name: 'x.svg', size: data.length },
        req,
        user: req.user,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })
})
