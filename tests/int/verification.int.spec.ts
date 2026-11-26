import { describe, expect, it } from 'vitest'

import { relId } from '@/access/roles'
import {
  assignRequest,
  decideRequest,
  requestVerification,
  reviewRequest,
  revokeVerification,
} from '@/lib/verification/service'
import { doc, p } from '@/seed/lexical'
import { communityId, createArticle, demoUser, payloadClient, reqAs } from './helpers'

async function article(id: string | number) {
  const payload = await payloadClient()
  return payload.findByID({ collection: 'articles', id: String(id), overrideAccess: true, depth: 0 })
}

/** Run an article through submit → assign → review(recommend approval) and return the request id. */
async function toAwaitingDecision(articleId: string) {
  const reviewer = await demoUser('reviewer')
  const approver = await demoUser('approver')
  const r = await requestVerification(await reqAs('personnel'), { articleId, communityId: await communityId() })
  await assignRequest(await reqAs('secretary'), { requestId: String(r.id), reviewerId: reviewer.id, approverId: approver.id })
  await reviewRequest(await reqAs('reviewer'), { requestId: String(r.id), decision: 'RECOMMEND_APPROVAL', comment: 'ดี' })
  return String(r.id)
}

describe('Verification workflow', () => {
  it('submits a request, records the version and keeps the article published', async () => {
    const payload = await payloadClient()
    const a = await createArticle('personnel', { community: await communityId() })
    const r = await requestVerification(await reqAs('personnel'), { articleId: String(a.id), communityId: await communityId() })
    expect(r.status).toBe('PENDING')
    expect(r.article_version).toBeTruthy()
    expect(r.snapshot?.content_hash).toBe((await article(a.id)).content_hash)
    const after = await article(a.id)
    expect(after.verification_status).toBe('PENDING')
    expect(after.publication_status).toBe('PUBLISHED')
    const history = await payload.find({ collection: 'verification-history', where: { article: { equals: a.id } }, overrideAccess: true })
    expect(history.totalDocs).toBe(1)
  })

  it('rejects verification of unpublished drafts and duplicate active requests', async () => {
    const draft = await createArticle('personnel', { status: 'DRAFT' })
    await expect(
      requestVerification(await reqAs('personnel'), { articleId: String(draft.id), communityId: await communityId() }),
    ).rejects.toThrow()
    const a = await createArticle('personnel')
    await requestVerification(await reqAs('personnel'), { articleId: String(a.id), communityId: await communityId() })
    await expect(
      requestVerification(await reqAs('personnel'), { articleId: String(a.id), communityId: await communityId() }),
    ).rejects.toThrow(/กำลังดำเนินการ|สถานะ/)
  })

  it('requires community membership to request verification', async () => {
    const a = await createArticle('writer')
    // writer is not a member of the digital-transformation community in the seed
    await expect(
      requestVerification(await reqAs('writer'), { articleId: String(a.id), communityId: await communityId('digital-transformation') }),
    ).rejects.toThrow(/สมาชิก/)
  })

  it('reviews, approves, records the approved version and shows PSU Verified', async () => {
    const payload = await payloadClient()
    const a = await createArticle('personnel')
    const requestId = await toAwaitingDecision(String(a.id))
    await decideRequest(await reqAs('approver'), { requestId, decision: 'APPROVE', note: 'ok' })
    const after = await article(a.id)
    const approver = await demoUser('approver')
    expect(after.verification_status).toBe('VERIFIED')
    expect(after.publication_type).toBe('ORGANIZATIONAL_KNOWLEDGE')
    expect(after.verified_by).toBe(approver.id)
    expect(after.verified_at).toBeTruthy()
    expect(after.current_verified_version).toBe(requestId)
    expect(after.verified_content_hash).toBe(after.content_hash)
    const reviews = await payload.find({ collection: 'verification-reviews', where: { verification_request: { equals: requestId } }, overrideAccess: true })
    expect(reviews.docs.map((r) => r.decision).sort()).toEqual(['APPROVE', 'RECOMMEND_APPROVAL'])
    const audit = await payload.find({ collection: 'audit-logs', where: { entity_id: { equals: requestId } }, overrideAccess: true })
    expect(audit.docs.map((d) => d.action)).toContain('VERIFICATION_APPROVED')
  })

  it('request revision → author notified → resubmission keeps assignment', async () => {
    const payload = await payloadClient()
    const a = await createArticle('personnel')
    const reviewer = await demoUser('reviewer')
    const approver = await demoUser('approver')
    const r = await requestVerification(await reqAs('personnel'), { articleId: String(a.id), communityId: await communityId() })
    await assignRequest(await reqAs('secretary'), { requestId: String(r.id), reviewerId: reviewer.id, approverId: approver.id })
    await expect(
      reviewRequest(await reqAs('reviewer'), { requestId: String(r.id), decision: 'REQUEST_REVISION' }),
    ).rejects.toThrow() // a reason is mandatory
    await reviewRequest(await reqAs('reviewer'), { requestId: String(r.id), decision: 'REQUEST_REVISION', comment: 'เพิ่มแหล่งอ้างอิง' })
    expect((await article(a.id)).verification_status).toBe('REVISION_REQUIRED')
    const personnel = await demoUser('personnel')
    const notes = await payload.find({
      collection: 'notifications',
      where: { and: [{ recipient: { equals: personnel.id } }, { related_article: { equals: a.id } }] },
      overrideAccess: true,
    })
    expect(notes.totalDocs).toBeGreaterThan(0)

    const r2 = await requestVerification(await reqAs('personnel'), { articleId: String(a.id), communityId: await communityId() })
    expect(r2.status).toBe('UNDER_REVIEW')
    expect(relId(r2.previous_request)).toBe(String(r.id))
    expect(relId(r2.assigned_reviewer)).toBe(reviewer.id)
  })

  it('rejects with a reason and keeps the article published', async () => {
    const a = await createArticle('personnel')
    const requestId = await toAwaitingDecision(String(a.id))
    await expect(decideRequest(await reqAs('approver'), { requestId, decision: 'REJECT' })).rejects.toThrow()
    await decideRequest(await reqAs('approver'), { requestId, decision: 'REJECT', note: 'ข้อมูลไม่ครบ' })
    const after = await article(a.id)
    expect(after.verification_status).toBe('REJECTED')
    expect(after.publication_status).toBe('PUBLISHED')
  })

  it('revokes a verification with a reason', async () => {
    const a = await createArticle('personnel')
    await decideRequest(await reqAs('approver'), { requestId: await toAwaitingDecision(String(a.id)), decision: 'APPROVE' })
    await expect(revokeVerification(await reqAs('approver'), { articleId: String(a.id) })).rejects.toThrow()
    await expect(revokeVerification(await reqAs('writer'), { articleId: String(a.id), reason: 'x' })).rejects.toThrow()
    await revokeVerification(await reqAs('approver'), { articleId: String(a.id), reason: 'ระเบียบเปลี่ยน' })
    const after = await article(a.id)
    expect(after.verification_status).toBe('REVOKED')
    expect(after.publication_type).toBe('COMMUNITY')
  })

  it('requires re-verification after a significant edit, but not after whitespace-only edits', async () => {
    const payload = await payloadClient()
    const a = await createArticle('personnel', { body: 'ข้อความเดิมที่ได้รับการรับรอง' })
    const requestId = await toAwaitingDecision(String(a.id))
    await decideRequest(await reqAs('approver'), { requestId, decision: 'APPROVE' })
    const req = await reqAs('personnel')

    await payload.update({
      collection: 'articles',
      id: a.id,
      data: { content: doc(p('  ข้อความเดิมที่ได้รับการรับรอง   ')) as never, allow_comments: false },
      req,
      user: req.user,
      overrideAccess: false,
    })
    expect((await article(a.id)).verification_status).toBe('VERIFIED')

    await payload.update({
      collection: 'articles',
      id: a.id,
      data: { content: doc(p('เนื้อหาใหม่ที่ยังไม่ได้ตรวจ')) as never },
      req,
      user: req.user,
      overrideAccess: false,
    })
    const after = await article(a.id)
    expect(after.verification_status).toBe('REVERIFICATION_REQUIRED')
    expect(after.publication_type).toBe('COMMUNITY')
    // The approved snapshot is preserved unchanged.
    const approved = await payload.findByID({ collection: 'verification-requests', id: requestId, overrideAccess: true })
    expect(JSON.stringify(approved.snapshot?.content)).toContain('ข้อความเดิมที่ได้รับการรับรอง')
    const history = await payload.find({ collection: 'verification-history', where: { article: { equals: a.id } }, overrideAccess: true, limit: 50 })
    expect(history.docs.map((h) => h.new_status)).toEqual(expect.arrayContaining(['VERIFIED', 'REVERIFICATION_REQUIRED']))
  })

  it('does not grant the badge to content edited while the review was in progress', async () => {
    const payload = await payloadClient()
    const a = await createArticle('personnel', { body: 'ฉบับที่ส่งตรวจ' })
    const requestId = await toAwaitingDecision(String(a.id))
    const req = await reqAs('personnel')
    await payload.update({ collection: 'articles', id: a.id, data: { content: doc(p('แก้ระหว่างตรวจ')) as never }, req, user: req.user, overrideAccess: false })
    await decideRequest(await reqAs('approver'), { requestId, decision: 'APPROVE' })
    expect((await article(a.id)).verification_status).toBe('REVERIFICATION_REQUIRED')
  })

  it('keeps verification history and reviews append-only for API clients', async () => {
    const payload = await payloadClient()
    const admin = await demoUser('superadmin')
    const h = await payload.find({ collection: 'verification-history', overrideAccess: true, limit: 1 })
    await expect(
      payload.update({ collection: 'verification-history', id: h.docs[0].id, data: { action_note: 'x' }, overrideAccess: false, user: admin }),
    ).rejects.toThrow()
    await expect(
      payload.delete({ collection: 'verification-history', id: h.docs[0].id, overrideAccess: false, user: admin }),
    ).rejects.toThrow()
    await expect(
      payload.create({ collection: 'verification-requests', data: {} as never, overrideAccess: false, user: admin }),
    ).rejects.toThrow()
    const log = await payload.find({ collection: 'audit-logs', overrideAccess: true, limit: 1 })
    await expect(
      payload.delete({ collection: 'audit-logs', id: log.docs[0].id, overrideAccess: false, user: admin }),
    ).rejects.toThrow()
  })
})
