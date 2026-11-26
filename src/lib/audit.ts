import type { PayloadRequest } from 'payload'

import { relId } from '@/access/roles'

type AuditArgs = {
  req: PayloadRequest
  action: string
  entityType: string
  entityId?: string | null
  metadata?: Record<string, unknown>
  actorId?: string | null
}

/**
 * Append an audit record. Metadata must describe the action, never copy
 * personal data (PDPA: log access, not data).
 */
export async function writeAudit({ req, action, entityType, entityId, metadata, actorId }: AuditArgs) {
  await req.payload.create({
    collection: 'audit-logs',
    data: {
      actor: actorId ?? relId(req.user) ?? undefined,
      action,
      entity_type: entityType,
      entity_id: entityId ?? undefined,
      metadata: metadata ?? {},
      timestamp: new Date().toISOString(),
    },
    overrideAccess: true,
    req,
  })
}

type NotifyArgs = {
  req: PayloadRequest
  recipients: (string | null | undefined)[]
  title: string
  message: string
  type: 'VERIFICATION' | 'COMMENT' | 'COMMUNITY' | 'SYSTEM' | 'MODERATION'
  articleId?: string | null
}

export async function notify({ req, recipients, title, message, type, articleId }: NotifyArgs) {
  const unique = Array.from(new Set(recipients.filter((r): r is string => Boolean(r))))
  for (const recipient of unique) {
    if (recipient === relId(req.user)) continue // do not notify the actor about their own action
    await req.payload.create({
      collection: 'notifications',
      data: {
        recipient,
        title,
        message,
        notification_type: type,
        related_article: articleId ?? undefined,
      },
      overrideAccess: true,
      req,
    })
  }
}
