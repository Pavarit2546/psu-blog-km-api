/**
 * HTTP tests against the running Docker stack (docker compose up -d).
 * Uses synthetic demo accounts only. Creates a few test uploads/articles in the dev DB.
 */
import { config as loadEnv } from 'dotenv'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'

loadEnv({ quiet: true } as never)
const BASE = process.env.PSU_KP_BASE_URL || 'http://localhost:3100'
const PASSWORD = process.env.SEED_DEMO_PASSWORD!
// Browsers send Fetch-Metadata headers; Payload's CSRF guard requires them for cookie auth.
const BROWSER = { Origin: BASE, 'Sec-Fetch-Site': 'same-origin' }

async function login(key: string) {
  const res = await fetch(`${BASE}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...BROWSER },
    body: JSON.stringify({ email: `${key}@demo.psu.local`, password: PASSWORD }),
  })
  expect(res.status).toBe(200)
  const cookie = res.headers.get('set-cookie')!.split(';')[0]
  return cookie
}

const get = (path: string, cookie?: string, extra: Record<string, string> = BROWSER) =>
  fetch(`${BASE}${path}`, { headers: { ...extra, ...(cookie ? { Cookie: cookie } : {}) }, redirect: 'manual' })
const post = (path: string, body: unknown, cookie?: string) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...BROWSER, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  })

let personnel = ''
beforeAll(async () => {
  personnel = await login('personnel')
})

/** Build a small, structurally valid one-page PDF (correct xref offsets). */
function minimalPdf(): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(body))
    body += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body)
}

describe('Stack health', () => {
  it('serves the site, admin and health endpoint', async () => {
    expect((await get('/')).status).toBe(200)
    expect((await get('/admin')).status).toBe(200)
    expect(await (await get('/api/health')).json()).toEqual({ status: 'ok' })
  })
})

describe('Authentication over HTTP', () => {
  it('sets an HttpOnly SameSite=Lax session cookie and resolves /me', async () => {
    const res = await fetch(`${BASE}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...BROWSER },
      body: JSON.stringify({ email: 'reviewer@demo.psu.local', password: PASSWORD }),
    })
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
    const me = await (await get('/api/users/me', setCookie.split(';')[0])).json()
    expect(me.user.email).toBe('reviewer@demo.psu.local')
  })

  it('logout invalidates the session', async () => {
    const cookie = await login('approver')
    const out = await post('/api/users/logout', {}, cookie)
    expect(out.status).toBe(200)
    const me = await (await get('/api/users/me', cookie)).json()
    expect(me.user).toBeNull()
  })

  it('rejects a cookie sent from a cross-site context (CSRF)', async () => {
    const me = await (await get('/api/users/me', personnel, { 'Sec-Fetch-Site': 'cross-site' })).json()
    expect(me.user).toBeNull()
    const evil = await (await get('/api/users/me', personnel, { Origin: 'https://evil.example' })).json()
    expect(evil.user).toBeNull()
  })

  it('redirects anonymous users away from private pages', async () => {
    const res = await get('/dashboard')
    expect([307, 308]).toContain(res.status)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('returns generic error for wrong credentials', async () => {
    const res = await fetch(`${BASE}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...BROWSER },
      body: JSON.stringify({ email: 'nobody@demo.psu.local', password: 'x' }),
    })
    expect(res.status).toBe(401)
  })
})

describe('Authorization over HTTP', () => {
  it('blocks unauthenticated workflow calls', async () => {
    const res = await post('/api/verification/decide', { requestId: '00000000-0000-0000-0000-000000000000', decision: 'APPROVE' })
    expect(res.status).toBe(401)
  })

  it('personnel cannot list users, audit logs or platform stats', async () => {
    const users = await (await get('/api/users?limit=100', personnel)).json()
    expect(users.totalDocs).toBe(1) // only themselves
    expect((await get('/api/audit-logs', personnel)).status).toBe(403)
    expect((await get('/api/platform-stats', personnel)).status).toBe(403)
  })

  it('public article API never exposes the private author relation or search text', async () => {
    const data = await (await get('/api/articles?limit=50&depth=0')).json()
    for (const a of data.docs) {
      expect(a.author).toBeUndefined()
      expect(a.search_text).toBeUndefined()
      expect(a.visibility).toBe('PUBLIC')
    }
  })

  it('search API respects visibility', async () => {
    const anon = await (await get('/api/search?q=PDPA')).json()
    expect(anon.hits).toHaveLength(0) // the PDPA demo article is INTERNAL
    const staff = await (await get('/api/search?q=PDPA', personnel)).json()
    expect(staff.hits.length).toBeGreaterThan(0)
  })
})

describe('Uploads to MinIO via Payload', () => {
  it('uploads an image and serves it back through access-controlled Payload route', async () => {
    const png = await sharp({ create: { width: 320, height: 200, channels: 3, background: '#1d5ea8' } }).png().toBuffer()
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), `http-test-${Date.now()}.png`)
    form.append('_payload', JSON.stringify({ alt: 'ภาพทดสอบ HTTP' }))
    const res = await fetch(`${BASE}/api/media`, { method: 'POST', headers: { ...BROWSER, Cookie: personnel }, body: form })
    expect(res.status).toBe(201)
    const { doc } = await res.json()
    const file = await fetch(new URL(doc.url, BASE))
    expect(file.status).toBe(200)
    expect(file.headers.get('content-type')).toContain('image/png')
    expect(Buffer.from(await file.arrayBuffer()).equals(png)).toBe(true)
  })

  it('rejects anonymous uploads', async () => {
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(10)], { type: 'image/png' }), 'x.png')
    expect((await fetch(`${BASE}/api/media`, { method: 'POST', headers: BROWSER, body: form })).status).toBe(403)

  })

  it('document attachments are not served to anonymous users', async () => {
    const pdf = minimalPdf()
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), `doc-${Date.now()}.pdf`)
    form.append('_payload', JSON.stringify({ alt: 'เอกสาร' }))
    const res = await fetch(`${BASE}/api/media`, { method: 'POST', headers: { ...BROWSER, Cookie: personnel }, body: form })
    expect(res.status).toBe(201)
    const { doc } = await res.json()
    expect(doc.media_type).toBe('DOCUMENT')
    expect((await fetch(new URL(doc.url, BASE))).status).toBeGreaterThanOrEqual(400)
    expect((await get(new URL(doc.url, BASE).pathname, personnel)).status).toBe(200)
  })

  // Last: the server aborts the connection mid-upload, which would break a reused keep-alive socket.
  it('rejects files larger than 10 MB', async () => {
    const big = new FormData()
    big.append('file', new Blob([new Uint8Array(11 * 1024 * 1024)], { type: 'application/pdf' }), 'big.pdf')
    big.append('_payload', JSON.stringify({ alt: 'big' }))
    const res = await fetch(`${BASE}/api/media`, { method: 'POST', headers: { ...BROWSER, Cookie: personnel }, body: big })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})
