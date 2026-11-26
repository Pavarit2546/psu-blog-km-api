/* eslint-disable @next/next/no-html-link-for-pages -- admin and site use different root layouts, so a full navigation is intended */
import React from 'react'
import { webURL } from '@/lib/webURL'

export function DashboardWelcome() {
  return (
    <div style={{ marginBottom: 24, padding: '16px 20px', borderRadius: 8, border: '1px solid var(--theme-elevation-150)' }}>
      <h3 style={{ margin: 0 }}>PSU Knowledge — ระบบจัดการเนื้อหา</h3>
      <p style={{ margin: '8px 0 0' }}>
        เขียนบทความใหม่ได้ที่ <a href="/admin/collections/articles/create">บทความ → สร้างใหม่</a> · กลับสู่{' '}
        <a href={webURL}>หน้าเว็บไซต์</a> · งานรับรองความรู้อยู่ที่ <a href={`${webURL}/dashboard/verification`}>Verification Dashboard</a>
      </p>
    </div>
  )
}
