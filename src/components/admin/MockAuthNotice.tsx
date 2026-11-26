import React from 'react'

import { getAuthProvider } from '@/lib/auth/provider'

/** Shown above the admin login form so nobody mistakes development login for PSU SSO. */
export function MockAuthNotice() {
  const provider = getAuthProvider()
  if (provider.kind !== 'mock') return null
  return (
    <div
      role="note"
      style={{
        border: '1px solid #d97706',
        background: '#fffbeb',
        color: '#78350f',
        padding: '12px 16px',
        borderRadius: 8,
        marginBottom: 24,
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <strong>Mock PSU Authentication — สำหรับการพัฒนาเท่านั้น</strong>
      <br />
      หน้านี้ไม่ใช่ PSU SSO จริง ใช้บัญชีทดสอบ (synthetic) ตามที่ระบุใน README เท่านั้น ห้ามใช้รหัสผ่าน PSU Passport จริง
    </div>
  )
}
