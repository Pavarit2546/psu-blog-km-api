import { describe, expect, it } from 'vitest'

import { assignRequest, decideRequest, requestVerification, reviewRequest } from '@/lib/verification/service'
import { communityId, createArticle, demoUser, payloadClient, reqAs } from './helpers'

async function awaitingDecision() {
  const a = await createArticle('personnel')
  const reviewer = await demoUser('reviewer')
  const approver = await demoUser('approver')
  const r = await requestVerification(await reqAs('personnel'), { articleId: String(a.id), communityId: await communityId() })
  await assignRequest(await reqAs('secretary'), { requestId: String(r.id), reviewerId: reviewer.id, approverId: approver.id })
  return { article: a, requestId: String(r.id) }
}

describe('Permissions', () => {
  it('personnel cannot approve verification', async () => {
    const { requestId } = await awaitingDecision()
    await reviewRequest(await reqAs('reviewer'), { requestId, decision: 'RECOMMEND_APPROVAL' })
    await expect(decideRequest(await reqAs('writer'), { requestId, decision: 'APPROVE' })).rejects.toThrow(/อนุมัติ/)
  })

  it('reviewer cannot perform the approval step', async () => {
    const { requestId } = await awaitingDecision()
    await reviewRequest(await reqAs('reviewer'), { requestId, decision: 'RECOMMEND_APPROVAL' })
    await expect(decideRequest(await reqAs('reviewer'), { requestId, decision: 'APPROVE' })).rejects.toThrow()
  })

  it('approver cannot decide before the reviewer has reviewed', async () => {
    const { requestId } = await awaitingDecision()
    await expect(decideRequest(await reqAs('approver'), { requestId, decision: 'APPROVE' })).rejects.toThrow()
  })

  it('only the assigned reviewer can review', async () => {
    const { requestId } = await awaitingDecision()
    await expect(
      reviewRequest(await reqAs('approver'), { requestId, decision: 'RECOMMEND_APPROVAL' }),
    ).rejects.toThrow()
  })

  it('cannot route an author to review or approve their own article', async () => {
    const a = await createArticle('reviewer') // the CoP reviewer writes an article
    const r = await requestVerification(await reqAs('reviewer'), { articleId: String(a.id), communityId: await communityId() })
    const reviewer = await demoUser('reviewer')
    const approver = await demoUser('approver')
    await expect(
      assignRequest(await reqAs('secretary'), { requestId: String(r.id), reviewerId: reviewer.id, approverId: approver.id }),
    ).rejects.toThrow(/ตนเอง/)
  })

  it('only the community secretary can assign reviewers', async () => {
    const a = await createArticle('personnel')
    const r = await requestVerification(await reqAs('personnel'), { articleId: String(a.id), communityId: await communityId() })
    const reviewer = await demoUser('reviewer')
    const approver = await demoUser('approver')
    await expect(
      assignRequest(await reqAs('personnel'), { requestId: String(r.id), reviewerId: reviewer.id, approverId: approver.id }),
    ).rejects.toThrow()
  })

  it('a user cannot read private identity fields of others', async () => {
    const payload = await payloadClient()
    const secretary = await demoUser('secretary') // secretaries may list users for assignment
    const personnel = await demoUser('personnel')
    const seen = await payload.findByID({ collection: 'users', id: personnel.id, overrideAccess: false, user: secretary })
    expect(seen.employee_id).toBeUndefined()
    expect(seen.email).toBeUndefined()
    expect(seen.global_roles).toBeUndefined()

    const writer = await demoUser('writer')
    await expect(payload.findByID({ collection: 'users', id: personnel.id, overrideAccess: false, user: writer })).rejects.toThrow()
  })

  it('the private author relation is hidden from other readers and anonymous users', async () => {
    const payload = await payloadClient()
    const a = await createArticle('personnel')
    const anon = await payload.findByID({ collection: 'articles', id: a.id, overrideAccess: false })
    expect(anon.author).toBeUndefined()
    const other = await payload.findByID({ collection: 'articles', id: a.id, overrideAccess: false, user: await demoUser('writer') })
    expect(other.author).toBeUndefined()
    const own = await payload.findByID({ collection: 'articles', id: a.id, overrideAccess: false, user: await demoUser('personnel') })
    expect(own.author).toBeTruthy()
  })

  it('pen-name articles never expose the real name or real profile key', async () => {
    const payload = await payloadClient()
    const writer = await demoUser('writer')
    const a = await createArticle('writer', { author_display: 'PEN_NAME' })
    const anon = await payload.findByID({ collection: 'articles', id: a.id, overrideAccess: false, depth: 2 })
    const json = JSON.stringify(anon)
    expect(anon.author_public?.name).toBe(writer.pen_name)
    expect(json).not.toContain(writer.name)
    expect(json).not.toContain(writer.public_key!)
    expect(json).not.toContain(writer.id)
    expect(json).not.toContain(writer.email)
    // The backend still knows the real author.
    const raw = await payload.findByID({ collection: 'articles', id: a.id, overrideAccess: true, depth: 0 })
    expect(raw.author).toBe(writer.id)
  })

  it('personnel cannot escalate their own roles; HR admin cannot grant SUPER_ADMIN', async () => {
    const payload = await payloadClient()
    const personnel = await demoUser('personnel')
    await payload.update({
      collection: 'users',
      id: personnel.id,
      data: { global_roles: ['SUPER_ADMIN'] as never },
      overrideAccess: false,
      user: personnel,
    })
    const after = await payload.findByID({ collection: 'users', id: personnel.id, overrideAccess: true })
    expect(after.global_roles).toEqual(['PSU_PERSONNEL'])

    const hr = await demoUser('hradmin')
    const req = await reqAs('hradmin')
    await expect(
      payload.update({ collection: 'users', id: personnel.id, data: { global_roles: ['PSU_PERSONNEL', 'SUPER_ADMIN'] }, overrideAccess: false, user: hr, req }),
    ).rejects.toThrow(/SUPER_ADMIN/)
  })

  it('normal users cannot read audit logs', async () => {
    const payload = await payloadClient()
    await expect(payload.find({ collection: 'audit-logs', overrideAccess: false, user: await demoUser('personnel') })).rejects.toThrow()
    const hr = await payload.find({ collection: 'audit-logs', overrideAccess: false, user: await demoUser('hradmin') })
    expect(hr.totalDocs).toBeGreaterThan(0)
  })
})
