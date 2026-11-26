import type { Payload } from 'payload'

export async function getPlatformStats(payload: Payload) {
  const count = async (collection: 'users' | 'articles' | 'communities' | 'verification-requests', where?: object) =>
    (await payload.count({ collection, where: where as never, overrideAccess: true })).totalDocs

  const [users, articles, communityBlog, verified, pendingVerification, communities, published, drafts] = await Promise.all([
    count('users'),
    count('articles'),
    count('articles', { and: [{ publication_status: { equals: 'PUBLISHED' } }, { publication_type: { equals: 'COMMUNITY' } }] }),
    count('articles', { verification_status: { equals: 'VERIFIED' } }),
    count('verification-requests', { status: { in: ['PENDING', 'UNDER_REVIEW', 'AWAITING_DECISION'] } }),
    count('communities'),
    count('articles', { publication_status: { equals: 'PUBLISHED' } }),
    count('articles', { publication_status: { equals: 'DRAFT' } }),
  ])

  const recent = await payload.find({
    collection: 'audit-logs',
    sort: '-timestamp',
    limit: 15,
    depth: 0,
    overrideAccess: true,
    select: { action: true, entity_type: true, entity_id: true, timestamp: true },
  })

  return {
    users,
    articles,
    published,
    drafts,
    communityBlog,
    verified,
    pendingVerification,
    communities,
    recentActivities: recent.docs,
  }
}
