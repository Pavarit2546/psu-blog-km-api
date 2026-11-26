'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import React from 'react'
import { webURL } from '@/lib/webURL'

const LABELS: Record<string, string> = {
  NOT_SUBMITTED: 'ยังไม่ได้ขอรับรอง',
  PENDING: 'รอเลขานุการมอบหมาย',
  UNDER_REVIEW: 'อยู่ระหว่างตรวจทาน',
  REVISION_REQUIRED: 'ต้องแก้ไข',
  VERIFIED: 'PSU Verified',
  REJECTED: 'ไม่อนุมัติ',
  REVOKED: 'ถูกเพิกถอน',
  REVERIFICATION_REQUIRED: 'ต้องรับรองใหม่ (เนื้อหาเปลี่ยน)',
}

/** Sidebar panel in the article editor: shows verification state and links to the workflow page. */
export function VerificationPanel() {
  const { id } = useDocumentInfo()
  const status = useFormFields(([fields]) => fields.verification_status?.value as string | undefined)
  const slug = useFormFields(([fields]) => fields.slug?.value as string | undefined)
  const publication = useFormFields(([fields]) => fields.publication_status?.value as string | undefined)

  return (
    <div style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 6, padding: 12, marginBottom: 16 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>การรับรองความรู้ (แยกจากการเผยแพร่)</div>
      <div style={{ fontWeight: 600, margin: '4px 0 8px' }}>{LABELS[status ?? 'NOT_SUBMITTED'] ?? status}</div>
      {!id ? (
        <div style={{ fontSize: 12 }}>บันทึกบทความก่อน แล้วจึงขอรับรองได้</div>
      ) : publication !== 'PUBLISHED' ? (
        <div style={{ fontSize: 12 }}>เผยแพร่บทความก่อน จึงจะขอรับรอง PSU Verified ได้</div>
      ) : slug ? (
        <a href={`${webURL}/articles/${encodeURIComponent(slug)}#verification`} target="_blank" rel="noopener noreferrer">
          ขอรับรอง / ดูสถานะ →
        </a>
      ) : null}
    </div>
  )
}
