import type { PayloadRequest } from 'payload'
import { APIError } from 'payload'

import { isActive, isAdmin, isSuperAdmin, relId, relIds } from '@/access/roles'
import type { Article, Community, VerificationRequest } from '@/payload-types'
import { notify, writeAudit } from '@/lib/audit'
import { recordHistory } from '@/lib/verification/history'

const fail = (message: string, status = 400): never => {
  throw new APIError(message, status, undefined, true)
}

const ACTIVE_REQUEST_STATUSES = ['PENDING', 'UNDER_REVIEW', 'AWAITING_DECISION'] as const
const REQUESTABLE_ARTICLE_STATUSES = [
  'NOT_SUBMITTED',
  'REVISION_REQUIRED',
  'REJECTED',
  'REVOKED',
  'REVERIFICATION_REQUIRED',
] as const

const SYSTEM_CONTEXT = { systemWrite: true, skipVerificationCheck: true }

function requireUser(req: PayloadRequest) {
  const user = req.user
  if (!isActive(user)) fail('ต้องเข้าสู่ระบบ', 401)
  return user!
}

async function loadArticle(req: PayloadRequest, id: string): Promise<Article> {
  try {
    return await req.payload.findByID({ collection: 'articles', id, depth: 0, overrideAccess: true, req })
  } catch {
    return fail('ไม่พบบทความ', 404)
  }
}

async function loadRequest(req: PayloadRequest, id: string): Promise<VerificationRequest> {
  try {
    return await req.payload.findByID({ collection: 'verification-requests', id, depth: 0, overrideAccess: true, req })
  } catch {
    return fail('ไม่พบคำขอรับรอง', 404)
  }
}

async function loadCommunity(req: PayloadRequest, id: string): Promise<Community> {
  try {
    return await req.payload.findByID({ collection: 'communities', id, depth: 0, overrideAccess: true, req })
  } catch {
    return fail('ไม่พบชุมชน', 404)
  }
}

async function updateArticle(req: PayloadRequest, id: string, data: Partial<Article>) {
  return req.payload.update({
    collection: 'articles',
    id,
    data,
    depth: 0,
    overrideAccess: true,
    req,
    context: SYSTEM_CONTEXT,
  })
}

async function updateRequest(req: PayloadRequest, id: string, data: Partial<VerificationRequest>) {
  return req.payload.update({
    collection: 'verification-requests',
    id,
    data,
    depth: 0,
    overrideAccess: true,
    req,
    context: SYSTEM_CONTEXT,
  })
}

async function addReview(
  req: PayloadRequest,
  requestId: string,
  role: 'COP_SECRETARY' | 'COP_REVIEWER' | 'COP_APPROVER' | 'ADMIN',
  decision: VerificationRequest['reviewer_recommendation'] | 'REQUEST_REVISION' | 'APPROVE' | 'REJECT' | 'REVOKE',
  comment?: string,
) {
  await req.payload.create({
    collection: 'verification-reviews',
    data: {
      verification_request: requestId,
      reviewer: relId(req.user)!,
      role,
      decision: decision as never,
      review_comment: comment,
      reviewed_at: new Date().toISOString(),
    },
    overrideAccess: true,
    req,
    context: SYSTEM_CONTEXT,
  })
}

/** Latest Payload version id of the article (exact version under review). */
async function latestVersionId(req: PayloadRequest, articleId: string): Promise<string | null> {
  const versions = await req.payload.findVersions({
    collection: 'articles',
    where: { parent: { equals: articleId } },
    sort: '-updatedAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return versions.docs[0] ? String(versions.docs[0].id) : null
}

// ---------------------------------------------------------------------------
// 1-5. Author requests verification
// ---------------------------------------------------------------------------
export async function requestVerification(
  req: PayloadRequest,
  input: { articleId: string; communityId?: string | null; note?: string },
) {
  const user = requireUser(req)
  const article = await loadArticle(req, input.articleId)

  if (relId(article.author) !== user.id) fail('เฉพาะผู้เขียนเท่านั้นที่ขอรับรองบทความได้', 403)
  if (article.publication_status !== 'PUBLISHED') fail('ต้องเผยแพร่บทความก่อนขอรับรอง')
  if (!REQUESTABLE_ARTICLE_STATUSES.includes(article.verification_status as never)) {
    fail(`ไม่สามารถขอรับรองได้ในสถานะ ${article.verification_status}`, 409)
  }
  const activeId = relId(article.active_verification_request)
  if (activeId) {
    const active = await loadRequest(req, activeId)
    if (ACTIVE_REQUEST_STATUSES.includes(active.status as never)) fail('มีคำขอรับรองที่กำลังดำเนินการอยู่แล้ว', 409)
  }

  const communityId = input.communityId || relId(article.community)
  if (!communityId) fail('กรุณาเลือกชุมชน (CoP) ที่จะรับรองบทความ')
  const community = await loadCommunity(req, communityId!)
  if (community.status !== 'ACTIVE') fail('ชุมชนนี้ปิดการใช้งานแล้ว', 409)
  const isMember = [community.members, community.secretary, community.reviewers, community.approvers].some((list) =>
    relIds(list).includes(user.id),
  )
  if (!isMember) fail('ต้องเป็นสมาชิกของชุมชนก่อนขอรับรองบทความ', 403)

  // Resubmission after a revision request keeps the previous assignment.
  const previous = await req.payload.find({
    collection: 'verification-requests',
    where: { and: [{ article: { equals: article.id } }, { community: { equals: community.id } }] },
    sort: '-submitted_at',
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const prev = previous.docs[0]
  const resubmission = prev?.status === 'REVISION_REQUIRED' && article.verification_status === 'REVISION_REQUIRED'
  const reviewer = resubmission ? relId(prev.assigned_reviewer) : null
  const approver = resubmission ? relId(prev.assigned_approver) : null
  const status = reviewer && approver ? 'UNDER_REVIEW' : 'PENDING'

  const versionId = await latestVersionId(req, String(article.id))
  const now = new Date().toISOString()
  const request = await req.payload.create({
    collection: 'verification-requests',
    data: {
      title: article.title,
      article: article.id,
      article_version: versionId ?? undefined,
      snapshot: {
        title: article.title,
        subtitle: article.subtitle,
        content: article.content as never,
        content_hash: article.content_hash,
        captured_at: now,
      },
      community: community.id,
      requested_by: user.id,
      assigned_reviewer: reviewer ?? undefined,
      assigned_approver: approver ?? undefined,
      status,
      decision_note: input.note,
      previous_request: resubmission ? prev.id : undefined,
      submitted_at: now,
    },
    overrideAccess: true,
    req,
    context: SYSTEM_CONTEXT,
  })

  const articleStatus = status === 'UNDER_REVIEW' ? 'UNDER_REVIEW' : 'PENDING'
  await updateArticle(req, String(article.id), {
    verification_status: articleStatus,
    active_verification_request: request.id,
    community: article.community ?? community.id,
  })
  await recordHistory({
    req,
    articleId: String(article.id),
    requestId: String(request.id),
    articleVersion: versionId,
    previousStatus: article.verification_status,
    newStatus: articleStatus,
    note: resubmission ? 'ส่งคำขอรับรองอีกครั้งหลังแก้ไข' : 'ส่งคำขอรับรองความรู้',
  })
  await writeAudit({
    req,
    action: resubmission ? 'VERIFICATION_RESUBMITTED' : 'VERIFICATION_REQUESTED',
    entityType: 'verification-requests',
    entityId: String(request.id),
    metadata: { article: article.id, community: community.id, version: versionId },
  })
  await notify({
    req,
    recipients: resubmission ? [reviewer] : relIds(community.secretary),
    title: resubmission ? 'บทความถูกส่งตรวจอีกครั้งหลังแก้ไข' : 'มีคำขอรับรองความรู้ใหม่',
    message: `“${article.title}” — ${community.name}`,
    type: 'VERIFICATION',
    articleId: String(article.id),
  })
  return request
}

// ---------------------------------------------------------------------------
// Secretary routes the request to a reviewer and an approver
// ---------------------------------------------------------------------------
export async function assignRequest(
  req: PayloadRequest,
  input: { requestId: string; reviewerId: string; approverId: string },
) {
  const user = requireUser(req)
  const request = await loadRequest(req, input.requestId)
  const community = await loadCommunity(req, relId(request.community)!)
  const isSecretary = relIds(community.secretary).includes(user.id)
  if (!isSecretary && !isSuperAdmin(user)) fail('เฉพาะเลขานุการ CoP ของชุมชนนี้เท่านั้นที่มอบหมายงานได้', 403)
  if (!['PENDING', 'UNDER_REVIEW'].includes(request.status)) fail(`ไม่สามารถมอบหมายในสถานะ ${request.status}`, 409)

  const requester = relId(request.requested_by)
  if (!relIds(community.reviewers).includes(input.reviewerId)) fail('ผู้ตรวจทานต้องมีบทบาท COP_REVIEWER ในชุมชนนี้', 422)
  if (!relIds(community.approvers).includes(input.approverId)) fail('ผู้อนุมัติต้องมีบทบาท COP_APPROVER ในชุมชนนี้', 422)
  if (input.reviewerId === requester || input.approverId === requester) {
    fail('ไม่สามารถมอบหมายให้ผู้เขียนตรวจหรืออนุมัติบทความของตนเอง', 422)
  }
  if (input.reviewerId === input.approverId) fail('ผู้ตรวจทานและผู้อนุมัติต้องเป็นคนละคน', 422)

  const updated = await updateRequest(req, String(request.id), {
    assigned_reviewer: input.reviewerId,
    assigned_approver: input.approverId,
    status: 'UNDER_REVIEW',
  })
  const article = await loadArticle(req, relId(request.article)!)
  if (article.verification_status !== 'UNDER_REVIEW') {
    await updateArticle(req, String(article.id), { verification_status: 'UNDER_REVIEW' })
    await recordHistory({
      req,
      articleId: String(article.id),
      requestId: String(request.id),
      articleVersion: request.article_version,
      previousStatus: article.verification_status,
      newStatus: 'UNDER_REVIEW',
      note: 'มอบหมายผู้ตรวจทานและผู้อนุมัติ',
    })
  }
  await writeAudit({
    req,
    action: 'VERIFICATION_ASSIGNED',
    entityType: 'verification-requests',
    entityId: String(request.id),
    metadata: { reviewer: input.reviewerId, approver: input.approverId, by: isSecretary ? 'COP_SECRETARY' : 'SUPER_ADMIN' },
  })
  await notify({
    req,
    recipients: [input.reviewerId],
    title: 'คุณได้รับมอบหมายให้ตรวจทานบทความ',
    message: `“${article.title}”`,
    type: 'VERIFICATION',
    articleId: String(article.id),
  })
  return updated
}

// ---------------------------------------------------------------------------
// 6-7. Reviewer examines the article
// ---------------------------------------------------------------------------
export type ReviewerDecision = 'REQUEST_REVISION' | 'RECOMMEND_APPROVAL' | 'RECOMMEND_REJECTION'

export async function reviewRequest(
  req: PayloadRequest,
  input: { requestId: string; decision: ReviewerDecision; comment?: string },
) {
  const user = requireUser(req)
  const request = await loadRequest(req, input.requestId)
  if (relId(request.assigned_reviewer) !== user.id) fail('คุณไม่ได้รับมอบหมายให้ตรวจทานคำขอนี้', 403)
  if (relId(request.requested_by) === user.id) fail('ไม่สามารถตรวจทานบทความของตนเอง', 403)
  const community = await loadCommunity(req, relId(request.community)!)
  if (!relIds(community.reviewers).includes(user.id)) fail('คุณไม่มีบทบาท COP_REVIEWER ในชุมชนนี้แล้ว', 403)
  if (request.status !== 'UNDER_REVIEW') fail(`ไม่สามารถตรวจทานในสถานะ ${request.status}`, 409)
  if (!['REQUEST_REVISION', 'RECOMMEND_APPROVAL', 'RECOMMEND_REJECTION'].includes(input.decision)) fail('ผลการพิจารณาไม่ถูกต้อง')
  const comment = input.comment?.trim()
  if (input.decision !== 'RECOMMEND_APPROVAL' && !comment) fail('กรุณาระบุเหตุผล/ข้อเสนอแนะ')

  const article = await loadArticle(req, relId(request.article)!)
  await addReview(req, String(request.id), 'COP_REVIEWER', input.decision, comment)

  if (input.decision === 'REQUEST_REVISION') {
    const updated = await updateRequest(req, String(request.id), {
      status: 'REVISION_REQUIRED',
      completed_at: new Date().toISOString(),
      decision_note: comment,
    })
    await updateArticle(req, String(article.id), {
      verification_status: 'REVISION_REQUIRED',
      active_verification_request: null,
    })
    await recordHistory({
      req,
      articleId: String(article.id),
      requestId: String(request.id),
      articleVersion: request.article_version,
      previousStatus: article.verification_status,
      newStatus: 'REVISION_REQUIRED',
      note: comment,
    })
    await writeAudit({ req, action: 'VERIFICATION_REVISION_REQUESTED', entityType: 'verification-requests', entityId: String(request.id) })
    await notify({
      req,
      recipients: [relId(request.requested_by)],
      title: 'ผู้ตรวจทานขอให้แก้ไขบทความ',
      message: `“${article.title}”: ${comment}`,
      type: 'VERIFICATION',
      articleId: String(article.id),
    })
    return updated
  }

  const updated = await updateRequest(req, String(request.id), {
    status: 'AWAITING_DECISION',
    reviewer_recommendation: input.decision,
  })
  await recordHistory({
    req,
    articleId: String(article.id),
    requestId: String(request.id),
    articleVersion: request.article_version,
    previousStatus: article.verification_status,
    newStatus: article.verification_status ?? 'UNDER_REVIEW',
    note: `ผู้ตรวจทาน: ${input.decision}${comment ? ` — ${comment}` : ''}`,
  })
  await writeAudit({
    req,
    action: `VERIFICATION_${input.decision}`,
    entityType: 'verification-requests',
    entityId: String(request.id),
  })
  await notify({
    req,
    recipients: [relId(request.assigned_approver)],
    title: 'มีบทความรอการอนุมัติ',
    message: `“${article.title}” — ผู้ตรวจทาน: ${input.decision === 'RECOMMEND_APPROVAL' ? 'เสนออนุมัติ' : 'เสนอไม่อนุมัติ'}`,
    type: 'VERIFICATION',
    articleId: String(article.id),
  })
  return updated
}

// ---------------------------------------------------------------------------
// 8-10. Approver makes the final decision
// ---------------------------------------------------------------------------
export async function decideRequest(
  req: PayloadRequest,
  input: { requestId: string; decision: 'APPROVE' | 'REJECT'; note?: string },
) {
  const user = requireUser(req)
  const request = await loadRequest(req, input.requestId)
  if (relId(request.assigned_approver) !== user.id) fail('คุณไม่ได้รับมอบหมายให้อนุมัติคำขอนี้', 403)
  const article = await loadArticle(req, relId(request.article)!)
  if (relId(request.requested_by) === user.id || relId(article.author) === user.id) {
    fail('ไม่สามารถอนุมัติบทความของตนเอง', 403)
  }
  const community = await loadCommunity(req, relId(request.community)!)
  if (!relIds(community.approvers).includes(user.id)) fail('คุณไม่มีบทบาท COP_APPROVER ในชุมชนนี้แล้ว', 403)
  if (request.status !== 'AWAITING_DECISION') fail('คำขอยังไม่ผ่านการตรวจทาน หรือได้รับการพิจารณาแล้ว', 409)
  if (!['APPROVE', 'REJECT'].includes(input.decision)) fail('ผลการพิจารณาไม่ถูกต้อง')
  const note = input.note?.trim()
  if (input.decision === 'REJECT' && !note) fail('กรุณาระบุเหตุผลที่ไม่อนุมัติ')

  const now = new Date().toISOString()
  await addReview(req, String(request.id), 'COP_APPROVER', input.decision, note)

  if (input.decision === 'APPROVE') {
    const updated = await updateRequest(req, String(request.id), {
      status: 'APPROVED',
      completed_at: now,
      decision_note: note,
    })
    // The approval covers the snapshot. If the live article changed during review,
    // it must not inherit the badge silently.
    const snapshotHash = request.snapshot?.content_hash ?? null
    const stillSame = Boolean(snapshotHash) && snapshotHash === article.content_hash
    const newStatus = stillSame ? 'VERIFIED' : 'REVERIFICATION_REQUIRED'
    await updateArticle(req, String(article.id), {
      verification_status: newStatus,
      publication_type: stillSame ? 'ORGANIZATIONAL_KNOWLEDGE' : 'COMMUNITY',
      verified_at: now,
      verified_by: user.id,
      current_verified_version: request.id,
      verified_content_hash: snapshotHash,
      active_verification_request: null,
    })
    await recordHistory({
      req,
      articleId: String(article.id),
      requestId: String(request.id),
      articleVersion: request.article_version,
      previousStatus: article.verification_status,
      newStatus,
      note: stillSame
        ? note || 'อนุมัติการรับรองความรู้'
        : 'อนุมัติ snapshot ที่ตรวจ แต่บทความถูกแก้ไขระหว่างพิจารณา ต้องขอรับรองฉบับปัจจุบันใหม่',
    })
    await writeAudit({
      req,
      action: 'VERIFICATION_APPROVED',
      entityType: 'verification-requests',
      entityId: String(request.id),
      metadata: { article: article.id, version: request.article_version, content_hash: snapshotHash },
    })
    await notify({
      req,
      recipients: [relId(request.requested_by)],
      title: 'บทความของคุณได้รับการรับรอง PSU Verified',
      message: `“${article.title}”`,
      type: 'VERIFICATION',
      articleId: String(article.id),
    })
    return updated
  }

  const updated = await updateRequest(req, String(request.id), {
    status: 'REJECTED',
    completed_at: now,
    decision_note: note,
  })
  await updateArticle(req, String(article.id), {
    verification_status: 'REJECTED',
    active_verification_request: null,
  })
  await recordHistory({
    req,
    articleId: String(article.id),
    requestId: String(request.id),
    articleVersion: request.article_version,
    previousStatus: article.verification_status,
    newStatus: 'REJECTED',
    note,
  })
  await writeAudit({ req, action: 'VERIFICATION_REJECTED', entityType: 'verification-requests', entityId: String(request.id) })
  await notify({
    req,
    recipients: [relId(request.requested_by)],
    title: 'คำขอรับรองไม่ได้รับการอนุมัติ',
    message: `“${article.title}”: ${note} (บทความยังคงเผยแพร่ตามปกติ)`,
    type: 'VERIFICATION',
    articleId: String(article.id),
  })
  return updated
}

// ---------------------------------------------------------------------------
// Revoke an existing verification
// ---------------------------------------------------------------------------
export async function revokeVerification(req: PayloadRequest, input: { articleId: string; reason?: string }) {
  const user = requireUser(req)
  const article = await loadArticle(req, input.articleId)
  if (!['VERIFIED', 'REVERIFICATION_REQUIRED'].includes(article.verification_status ?? '')) {
    fail('บทความนี้ไม่ได้อยู่ในสถานะที่ได้รับการรับรอง', 409)
  }
  const verifiedRequestId = relId(article.current_verified_version)
  const verifiedRequest = verifiedRequestId ? await loadRequest(req, verifiedRequestId) : null
  const communityId = relId(verifiedRequest?.community) ?? relId(article.community)
  const community = communityId ? await loadCommunity(req, communityId) : null
  const isApprover = Boolean(community && relIds(community.approvers).includes(user.id))
  if (!isApprover && !isAdmin(user)) fail('เฉพาะ COP_APPROVER ของชุมชนหรือผู้ดูแลระบบเท่านั้นที่เพิกถอนได้', 403)
  if (relId(article.author) === user.id) fail('ไม่สามารถเพิกถอนการรับรองบทความของตนเอง', 403)
  const reason = input.reason?.trim()
  if (!reason) fail('กรุณาระบุเหตุผลในการเพิกถอน')

  const updated = await updateArticle(req, String(article.id), {
    verification_status: 'REVOKED',
    publication_type: 'COMMUNITY',
  })
  if (verifiedRequest) await addReview(req, String(verifiedRequest.id), isApprover ? 'COP_APPROVER' : 'ADMIN', 'REVOKE', reason)
  await recordHistory({
    req,
    articleId: String(article.id),
    requestId: verifiedRequestId,
    articleVersion: verifiedRequest?.article_version,
    previousStatus: article.verification_status,
    newStatus: 'REVOKED',
    note: reason,
  })
  await writeAudit({ req, action: 'VERIFICATION_REVOKED', entityType: 'articles', entityId: String(article.id), metadata: { reason } })
  await notify({
    req,
    recipients: [relId(article.author)],
    title: 'การรับรองบทความถูกเพิกถอน',
    message: `“${article.title}”: ${reason}`,
    type: 'VERIFICATION',
    articleId: String(article.id),
  })
  return updated
}

// ---------------------------------------------------------------------------
// Author withdraws an active request
// ---------------------------------------------------------------------------
export async function cancelRequest(req: PayloadRequest, input: { requestId: string }) {
  const user = requireUser(req)
  const request = await loadRequest(req, input.requestId)
  if (relId(request.requested_by) !== user.id) fail('เฉพาะผู้ส่งคำขอเท่านั้นที่ยกเลิกได้', 403)
  if (!ACTIVE_REQUEST_STATUSES.includes(request.status as never)) fail('คำขอนี้ปิดไปแล้ว', 409)
  const article = await loadArticle(req, relId(request.article)!)
  const updated = await updateRequest(req, String(request.id), { status: 'CANCELLED', completed_at: new Date().toISOString() })
  // Restore the status the article had before this request.
  const restored = article.current_verified_version
    ? article.verified_content_hash === article.content_hash
      ? 'VERIFIED'
      : 'REVERIFICATION_REQUIRED'
    : 'NOT_SUBMITTED'
  await updateArticle(req, String(article.id), { verification_status: restored, active_verification_request: null })
  await recordHistory({
    req,
    articleId: String(article.id),
    requestId: String(request.id),
    previousStatus: article.verification_status,
    newStatus: restored,
    note: 'ผู้เขียนยกเลิกคำขอ',
  })
  await writeAudit({ req, action: 'VERIFICATION_CANCELLED', entityType: 'verification-requests', entityId: String(request.id) })
  return updated
}
