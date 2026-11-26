import type { PayloadRequest } from 'payload'

import { relId } from '@/access/roles'

type HistoryArgs = {
  req: PayloadRequest
  articleId: string
  requestId?: string | null
  articleVersion?: string | null
  previousStatus?: string | null
  newStatus: string
  note?: string
}

/** Append-only verification history entry (collection denies create/update/delete to API clients). */
export async function recordHistory({ req, articleId, requestId, articleVersion, previousStatus, newStatus, note }: HistoryArgs) {
  await req.payload.create({
    collection: 'verification-history',
    data: {
      article: articleId,
      verification_request: requestId ?? undefined,
      article_version: articleVersion ?? undefined,
      previous_status: previousStatus ?? undefined,
      new_status: newStatus,
      action_by: relId(req.user) ?? undefined,
      action_note: note ?? undefined,
    },
    overrideAccess: true,
    req,
  })
}
