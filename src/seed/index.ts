/**
 * Development seed — SYNTHETIC DATA ONLY (PDPA: no real personnel data).
 *
 *   pnpm seed                 (host, DB via docker-compose.dev.yml)
 *   docker compose --profile tools run --rm tools pnpm seed
 *
 * All demo accounts share the password from SEED_DEMO_PASSWORD (.env).
 * Refuses to run against NODE_ENV=production unless ALLOW_DEMO_SEED=true.
 */
import type { Payload, PayloadRequest } from 'payload'
import { createLocalReq } from 'payload'
import sharp from 'sharp'

import type { User } from '@/payload-types'
import { assignRequest, decideRequest, requestVerification, reviewRequest } from '@/lib/verification/service'
import { doc, embed, h2, p, quote, ul } from './lexical'

export const DEMO_DOMAIN = 'demo.psu.local'

export const DEMO_USERS = [
  { key: 'personnel', name: 'สมชาย ทดสอบระบบ', roles: ['PSU_PERSONNEL'], department: 'กองบริหารทรัพยากรบุคคล (ข้อมูลสมมติ)', position: 'นักทรัพยากรบุคคล', display_mode: 'REAL_NAME' },
  { key: 'writer', name: 'สมหญิง ตัวอย่าง', roles: ['PSU_PERSONNEL'], department: 'คณะตัวอย่างศาสตร์ (ข้อมูลสมมติ)', position: 'อาจารย์', display_mode: 'PEN_NAME', pen_name: 'นักเล่าเรื่องปักษ์ใต้' },
  { key: 'secretary', name: 'วิชัย เลขาทดสอบ', roles: ['PSU_PERSONNEL'], department: 'กองบริหารทรัพยากรบุคคล (ข้อมูลสมมติ)', position: 'เลขานุการ CoP', display_mode: 'REAL_NAME' },
  { key: 'reviewer', name: 'อรุณี ผู้ตรวจทดสอบ', roles: ['PSU_PERSONNEL'], department: 'สำนักทดสอบคุณภาพ (ข้อมูลสมมติ)', position: 'ผู้ตรวจทาน', display_mode: 'REAL_NAME' },
  { key: 'approver', name: 'ประเสริฐ ผู้อนุมัติทดสอบ', roles: ['PSU_PERSONNEL'], department: 'สำนักทดสอบคุณภาพ (ข้อมูลสมมติ)', position: 'ผู้อนุมัติ', display_mode: 'REAL_NAME' },
  { key: 'hradmin', name: 'ผู้ดูแล HR ทดสอบ', roles: ['PSU_PERSONNEL', 'HR_ADMIN'], department: 'กองบริหารทรัพยากรบุคคล (ข้อมูลสมมติ)', position: 'HR Admin', display_mode: 'REAL_NAME' },
  { key: 'superadmin', name: 'ผู้ดูแลระบบทดสอบ', roles: ['PSU_PERSONNEL', 'SUPER_ADMIN'], department: 'ศูนย์ระบบสารสนเทศ (ข้อมูลสมมติ)', position: 'Super Admin', display_mode: 'REAL_NAME' },
] as const

export type DemoKey = (typeof DEMO_USERS)[number]['key']
export const demoEmail = (key: string) => `${key}@${DEMO_DOMAIN}`

async function gradientImage(seed: number): Promise<Buffer> {
  const palettes = [
    ['#0b3b6f', '#1f78b4', '#a6cee3'],
    ['#0f4c5c', '#5f9ea0', '#e0f2f1'],
    ['#3d2c8d', '#916bbf', '#c996cc'],
    ['#7c2d12', '#ea580c', '#fed7aa'],
    ['#14532d', '#16a34a', '#bbf7d0'],
    ['#1e293b', '#475569', '#cbd5e1'],
  ]
  const [a, b, c] = palettes[seed % palettes.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/><stop offset="0.6" stop-color="${b}"/><stop offset="1" stop-color="${c}"/>
    </linearGradient></defs>
    <rect width="1600" height="900" fill="url(#g)"/>
    <circle cx="${300 + seed * 170}" cy="${250 + (seed % 3) * 120}" r="${220 + seed * 15}" fill="#ffffff" fill-opacity="0.08"/>
    <circle cx="${1200 - seed * 60}" cy="700" r="320" fill="#ffffff" fill-opacity="0.06"/>
    <rect x="120" y="640" width="${520 + seed * 40}" height="14" rx="7" fill="#ffffff" fill-opacity="0.35"/>
    <rect x="120" y="680" width="${360 + seed * 30}" height="14" rx="7" fill="#ffffff" fill-opacity="0.25"/>
  </svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

async function asUser(payload: Payload, user: User): Promise<PayloadRequest> {
  return createLocalReq({ user: { ...user, collection: 'users' } as never }, payload)
}

export async function seed(payload: Payload, opts: { password: string; log?: (m: string) => void }) {
  const log = opts.log ?? ((m: string) => payload.logger.info(m))

  const existing = await payload.count({ collection: 'users', where: { email: { equals: demoEmail('superadmin') } } })
  if (existing.totalDocs > 0) {
    log('Seed skipped: demo data already present (reset the dev DB first, see README).')
    return { skipped: true as const }
  }

  // ---------------- users ----------------
  const users = {} as Record<DemoKey, User>
  let n = 1
  for (const u of DEMO_USERS) {
    users[u.key] = await payload.create({
      collection: 'users',
      data: {
        email: demoEmail(u.key),
        password: opts.password,
        name: u.name,
        employee_id: `DEMO-${String(n++).padStart(4, '0')}`,
        department: u.department,
        position: u.position,
        show_department: u.key !== 'writer',
        display_mode: u.display_mode,
        pen_name: 'pen_name' in u ? u.pen_name : undefined,
        bio: `บัญชีทดสอบสำหรับบทบาท ${u.key} (ข้อมูลสมมติ ใช้ในสภาพแวดล้อมพัฒนาเท่านั้น)`,
        global_roles: [...u.roles],
        status: 'ACTIVE',
      },
      overrideAccess: true,
    })
  }
  log(`Created ${DEMO_USERS.length} demo users`)

  // ---------------- media ----------------
  const adminReq = await asUser(payload, users.superadmin)
  const covers: string[] = []
  for (let i = 0; i < 6; i++) {
    const data = await gradientImage(i)
    const media = await payload.create({
      collection: 'media',
      data: { alt: `ภาพปกตัวอย่าง ${i + 1}` },
      file: { data, mimetype: 'image/png', name: `demo-cover-${i + 1}.png`, size: data.length },
      req: adminReq,
      overrideAccess: true,
    })
    covers.push(String(media.id))
  }
  log('Uploaded demo cover images')

  // ---------------- tags ----------------
  const tagNames = ['การบริหารทรัพยากรบุคคล', 'สวัสดิการ', 'การพัฒนาบุคลากร', 'Digital Transformation', 'KM', 'งานสารบรรณ', 'ความปลอดภัยข้อมูล', 'PDPA']
  const tags: Record<string, string> = {}
  for (const name of tagNames) {
    const t = await payload.create({ collection: 'tags', data: { name, slug: '' }, overrideAccess: true })
    tags[name] = String(t.id)
  }

  // ---------------- communities ----------------
  const all = Object.values(users).map((u) => u.id)
  const hrCop = await payload.create({
    collection: 'communities',
    data: {
      name: 'CoP การบริหารทรัพยากรบุคคล',
      slug: 'hr-management',
      description: 'ชุมชนนักปฏิบัติด้านงานบุคคล แลกเปลี่ยนแนวปฏิบัติ ระเบียบ และประสบการณ์การทำงาน',
      cover_image: covers[0],
      status: 'ACTIVE',
      secretary: [users.secretary.id],
      reviewers: [users.reviewer.id],
      approvers: [users.approver.id],
      members: all,
    },
    req: adminReq,
    overrideAccess: true,
  })
  const digitalCop = await payload.create({
    collection: 'communities',
    data: {
      name: 'CoP Digital Transformation',
      slug: 'digital-transformation',
      description: 'ชุมชนแลกเปลี่ยนเรื่องระบบดิจิทัล การทำงานด้วยข้อมูล และเครื่องมือใหม่ ๆ',
      cover_image: covers[1],
      status: 'ACTIVE',
      secretary: [users.secretary.id],
      reviewers: [users.reviewer.id],
      approvers: [users.approver.id],
      members: [users.personnel.id, users.secretary.id, users.reviewer.id, users.approver.id],
    },
    req: adminReq,
    overrideAccess: true,
  })
  await payload.create({
    collection: 'communities',
    data: {
      name: 'CoP การพัฒนาบุคลากรและการเรียนรู้',
      slug: 'learning-development',
      description: 'ชุมชนสำหรับผู้สนใจการออกแบบการเรียนรู้ การโค้ช และการพัฒนาสมรรถนะ',
      cover_image: covers[2],
      status: 'ACTIVE',
      secretary: [users.secretary.id],
      reviewers: [users.reviewer.id],
      approvers: [users.approver.id],
      members: [users.secretary.id],
    },
    req: adminReq,
    overrideAccess: true,
  })
  log('Created 3 communities')

  // ---------------- articles ----------------
  const write = async (
    who: DemoKey,
    data: {
      title: string
      subtitle?: string
      content: unknown
      cover?: number
      community?: string
      tags?: string[]
      visibility?: 'PUBLIC' | 'INTERNAL'
      status?: 'DRAFT' | 'PUBLISHED'
      featured?: boolean
      author_display?: 'REAL_NAME' | 'PEN_NAME'
    },
  ) => {
    const req = await asUser(payload, users[who])
    const article = await payload.create({
      collection: 'articles',
      data: {
        title: data.title,
        subtitle: data.subtitle,
        content: data.content as never,
        featured_image: data.cover !== undefined ? covers[data.cover] : undefined,
        community: data.community,
        tags: (data.tags ?? []).map((t) => tags[t]),
        visibility: data.visibility ?? 'PUBLIC',
        publication_status: data.status ?? 'PUBLISHED',
        author_display: data.author_display,
        allow_comments: true,
      },
      req,
      user: req.user,
      overrideAccess: false,
    })
    if (data.featured) {
      await payload.update({ collection: 'articles', id: article.id, data: { featured: true }, overrideAccess: true })
    }
    return article
  }

  const welfare = await write('personnel', {
    title: 'คู่มือย่อ: สิทธิสวัสดิการที่บุคลากรใหม่ควรรู้',
    subtitle: 'สรุปขั้นตอนและเอกสารที่ต้องเตรียมในเดือนแรกของการทำงาน (ตัวอย่างเนื้อหา)',
    content: doc(
      p('บทความนี้เป็นเนื้อหาตัวอย่างสำหรับการสาธิตระบบ PSU Knowledge ไม่ใช่ระเบียบหรือประกาศจริงของมหาวิทยาลัย'),
      h2('1. เตรียมเอกสารให้พร้อม'),
      ul(['สำเนาเอกสารยืนยันตัวตน (ตัวอย่าง)', 'แบบฟอร์มขอรับสวัสดิการ (ตัวอย่าง)', 'ข้อมูลบัญชีสำหรับรับเงิน (ตัวอย่าง)']),
      h2('2. ช่องทางติดต่อ'),
      p('ติดต่อหน่วยงานบุคคลของคณะหรือส่วนงาน เพื่อขอคำแนะนำเพิ่มเติม'),
      quote('ความรู้ที่ถูกแบ่งปัน คือความรู้ที่เติบโต'),
    ),
    cover: 0,
    community: String(hrCop.id),
    tags: ['สวัสดิการ', 'การบริหารทรัพยากรบุคคล'],
    featured: true,
  })

  const pdpa = await write('personnel', {
    title: 'แนวปฏิบัติ PDPA สำหรับงานเอกสารบุคคล',
    subtitle: 'หลักการเก็บ ใช้ และเปิดเผยข้อมูลส่วนบุคคลให้น้อยที่สุดเท่าที่จำเป็น',
    content: doc(
      p('การทำงานกับข้อมูลบุคลากรต้องยึดหลักความจำเป็น (data minimisation) และระบุฐานทางกฎหมายทุกครั้ง'),
      h2('หลักการสำคัญ'),
      ul(['เก็บเฉพาะข้อมูลที่จำเป็น', 'กำหนดระยะเวลาเก็บรักษา', 'บันทึกการเข้าถึงแทนการบันทึกตัวข้อมูล', 'ปกปิดข้อมูลเมื่อต้องแสดงผล']),
      p('เนื้อหานี้เป็นตัวอย่างเพื่อการสาธิตระบบเท่านั้น'),
    ),
    cover: 5,
    community: String(hrCop.id),
    tags: ['PDPA', 'ความปลอดภัยข้อมูล'],
    visibility: 'INTERNAL',
  })

  const digital = await write('personnel', {
    title: 'เริ่มต้นทำงานแบบ Data-driven ในหน่วยงานสนับสนุน',
    subtitle: 'จากตารางคำนวณสู่แดชบอร์ด: บทเรียนจากการทดลองใช้งานจริง (ตัวอย่าง)',
    content: doc(
      p('การเริ่มต้นใช้ข้อมูลในการตัดสินใจไม่จำเป็นต้องเริ่มจากระบบใหญ่ เริ่มจากคำถามที่ชัดเจนก่อน'),
      h2('ขั้นตอนที่แนะนำ'),
      ul(['กำหนดคำถามทางธุรกิจ', 'สำรวจแหล่งข้อมูลที่มี', 'ทำต้นแบบเล็ก ๆ แล้วเก็บ feedback']),
      embed('https://www.youtube.com/watch?v=aqz-KE-bpKQ', 'ตัวอย่างการฝังวิดีโอ (YouTube)'),
    ),
    cover: 1,
    community: String(digitalCop.id),
    tags: ['Digital Transformation', 'KM'],
    featured: true,
  })

  await write('writer', {
    title: 'เรื่องเล่าจากหน้างาน: วันที่ระบบล่มก่อนปิดงบประมาณ',
    subtitle: 'บันทึกประสบการณ์ภายใต้นามปากกา',
    content: doc(
      p('เรื่องเล่านี้เขียนภายใต้นามปากกา ระบบยังบันทึกตัวตนจริงของผู้เขียนไว้ภายใน แต่ไม่เปิดเผยต่อผู้อ่าน'),
      p('สิ่งที่ได้เรียนรู้คือ การสำรองข้อมูลที่ดีต้องถูกทดสอบการกู้คืนเสมอ ไม่ใช่แค่สำรองไว้'),
    ),
    cover: 3,
    community: String(hrCop.id),
    tags: ['KM'],
    author_display: 'PEN_NAME',
  })

  await write('secretary', {
    title: 'ชวนเขียน: 5 เทคนิคถ่ายทอดความรู้จากงานประจำ',
    subtitle: 'เปลี่ยนประสบการณ์ให้เป็นบทความที่เพื่อนร่วมงานนำไปใช้ได้',
    content: doc(
      ul(['เริ่มจากปัญหาที่เจอบ่อย', 'เล่าบริบทสั้น ๆ', 'ให้ขั้นตอนที่ทำตามได้', 'แนบตัวอย่างเอกสาร', 'บอกข้อควรระวัง']),
      p('บทความที่ดีไม่จำเป็นต้องยาว แต่ต้องตอบคำถามผู้อ่านได้'),
    ),
    cover: 4,
    community: String(hrCop.id),
    tags: ['KM', 'การพัฒนาบุคลากร'],
  })

  await write('reviewer', {
    title: 'สรุปงานสารบรรณอิเล็กทรอนิกส์สำหรับหน่วยงาน',
    subtitle: 'ข้อควรรู้เบื้องต้น (ตัวอย่างเนื้อหา)',
    content: doc(p('สรุปแนวทางเบื้องต้นของงานสารบรรณอิเล็กทรอนิกส์ เพื่อใช้ในการสาธิตระบบค้นหาและหน้าอ่านบทความ')),
    cover: 2,
    tags: ['งานสารบรรณ', 'Digital Transformation'],
  })

  await write('personnel', {
    title: 'ฉบับร่าง: แผนพัฒนาตนเองรายบุคคล (IDP)',
    content: doc(p('ฉบับร่าง — ยังไม่เผยแพร่ มองเห็นเฉพาะผู้เขียน')),
    status: 'DRAFT',
    tags: ['การพัฒนาบุคลากร'],
  })
  log('Created demo articles')

  // ---------------- verification flows (through the real service) ----------------
  const personnelReq = await asUser(payload, users.personnel)
  const secretaryReq = await asUser(payload, users.secretary)
  const reviewerReq = await asUser(payload, users.reviewer)
  const approverReq = await asUser(payload, users.approver)

  // 1) Fully verified
  const r1 = await requestVerification(personnelReq, { articleId: String(welfare.id), communityId: String(hrCop.id) })
  await assignRequest(secretaryReq, { requestId: String(r1.id), reviewerId: users.reviewer.id, approverId: users.approver.id })
  await reviewRequest(reviewerReq, { requestId: String(r1.id), decision: 'RECOMMEND_APPROVAL', comment: 'เนื้อหาครบถ้วน อ้างอิงชัดเจน' })
  await decideRequest(approverReq, { requestId: String(r1.id), decision: 'APPROVE', note: 'อนุมัติเป็นความรู้องค์กร' })

  // 2) Waiting for secretary assignment
  await requestVerification(personnelReq, { articleId: String(digital.id), communityId: String(digitalCop.id) })

  // 3) Revision requested
  const r3 = await requestVerification(personnelReq, { articleId: String(pdpa.id), communityId: String(hrCop.id) })
  await assignRequest(secretaryReq, { requestId: String(r3.id), reviewerId: users.reviewer.id, approverId: users.approver.id })
  await reviewRequest(reviewerReq, {
    requestId: String(r3.id),
    decision: 'REQUEST_REVISION',
    comment: 'กรุณาเพิ่มตัวอย่างระยะเวลาการเก็บรักษาข้อมูล',
  })
  log('Created verification examples (verified / pending / revision required)')

  // ---------------- comments ----------------
  const reviewerCommentReq = await asUser(payload, users.reviewer)
  const c1 = await payload.create({
    collection: 'comments',
    data: { article: welfare.id, content: 'ขอบคุณสำหรับสรุปที่อ่านง่ายครับ' },
    req: reviewerCommentReq,
    user: reviewerCommentReq.user,
    overrideAccess: false,
  })
  const secretaryCommentReq = await asUser(payload, users.secretary)
  await payload.create({
    collection: 'comments',
    data: { article: welfare.id, content: 'เห็นด้วยค่ะ จะนำไปใช้ในการปฐมนิเทศ', parent_comment: c1.id },
    req: secretaryCommentReq,
    user: secretaryCommentReq.user,
    overrideAccess: false,
  })
  log('Seed complete')
  return { skipped: false as const }
}
