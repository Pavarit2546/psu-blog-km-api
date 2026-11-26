# PSU Blog KM API

บริการข้อมูลของแพลตฟอร์มจัดการความรู้ ม.อ. ให้บริการ Payload REST API, Payload Admin และ Lexical editor เว็บสำหรับผู้อ่านและผู้เขียนแยกอยู่ใน repo `psu-blog-km-web` ทั้งสอง repo build และ deploy แยกกันได้

## เริ่มชุดพัฒนา

ใช้ Docker Desktop ที่รองรับ Compose v2 คัดลอก `.env.example` เป็น `.env` บนเครื่องใหม่ ใส่ค่าแทน placeholder ทุกตำแหน่ง ตั้ง `DATABASE_URL` ให้ใช้รหัสผ่านเดียวกับ `APP_DB_PASSWORD` และใช้รหัสผ่านแบบ hex สำหรับ connection string

```sh
docker compose up -d --build
docker compose --profile tools run --rm --build tools pnpm seed
```

จากนั้นเริ่ม web ตาม README ของ repo นั้น เปิดเว็บที่ http://localhost:3100 และ editor ที่ http://localhost:3100/admin ส่วน http://localhost:3101/api/health ใช้ตรวจ API โดยตรง บัญชีบุคลากรตัวอย่างคือ `personnel@demo.psu.local` และใช้รหัสผ่านจาก `SEED_DEMO_PASSWORD` ในไฟล์ .env ของ API ระบบใช้ mock login สำหรับการพัฒนา

Compose ใช้ PostgreSQL 17, MinIO และ volume ภายใต้ชื่อโปรเจกต์ `psu-blog-km-api` การเริ่มครั้งแรกสร้างฐานและ bucket ชุดใหม่ ไฟล์และบทความในระบบเดิมอยู่กับ volume เดิม

## ส่วนของโค้ด

- `src/collections` และ `src/access` กำหนดโมเดลข้อมูลและสิทธิ์
- `src/endpoints` ให้บริการค้นหา การรับรอง สมาชิก และข้อมูลที่ต้องคำนวณให้เว็บที่ `/api/km`
- `src/lib/verification` จัดการคำขอ ผลการพิจารณา และประวัติ
- `src/app/(payload)` ให้บริการ REST และ Admin
- `src/migrations` เป็นที่มาของ schema เมื่อเปลี่ยน collection ให้สร้าง migration พร้อมอัปเดต generated types และสัญญาใน repo เว็บ

## พัฒนาบน host

ใช้ Node 24.22.3 และ pnpm 10.34.9 เปิด PostgreSQL บนพอร์ต 5533 และ MinIO บน 9100 สำหรับการพัฒนา ถ้าใช้ API ใน Docker อยู่ ให้หยุดเฉพาะบริการ api ก่อนรัน dev บนพอร์ตเดียวกัน

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres minio minio-init
corepack pnpm install --frozen-lockfile
corepack pnpm migrate
corepack pnpm seed
corepack pnpm dev
```

ใช้ `pnpm typecheck`, `pnpm lint` และ `pnpm test:int` เพื่อตรวจโค้ดและ workflow ชุด integration จะ reset ฐาน `APP_TEST_DB_NAME` และใช้ bucket ทดสอบ ส่วน `pnpm test:http` ทดสอบผ่าน web gateway จึงต้องเปิดทั้งสองบริการและ seed ข้อมูลก่อน ชุด HTTP สร้างไฟล์ทดสอบในระบบที่เลือก

## การติดตั้ง

กำหนด `NEXT_PUBLIC_SERVER_URL` เป็น origin ของเว็บทั้งตอน build และ runtime โดยเฉพาะเมื่อเปลี่ยนโดเมน ให้ web หรือ reverse proxy ส่ง `/api`, `/admin` และ `/km-admin-static` มายังบริการนี้ ใช้ HTTPS และเปิด `COOKIE_SECURE` เมื่อใช้งานผ่าน HTTPS

สคริปต์ `scripts/backup.sh`, `scripts/verify-backup.sh` และ `scripts/restore.sh` ใช้กับ Compose ของ repo นี้ การซ้อมกู้ให้ระบุฐานข้อมูลและ bucket สำหรับการซ้อมแยกจากระบบที่ให้บริการ
