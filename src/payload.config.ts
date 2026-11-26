import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { en } from '@payloadcms/translations/languages/en'
import { th } from '@payloadcms/translations/languages/th'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { Articles } from './collections/Articles'
import { Comments } from './collections/Comments'
import { Communities } from './collections/Communities'
import { MAX_UPLOAD_BYTES, Media } from './collections/Media'
import { AuditLogs, Bookmarks, Notifications } from './collections/System'
import { Tags } from './collections/Tags'
import { Users } from './collections/Users'
import { VerificationHistory, VerificationRequests, VerificationReviews } from './collections/Verification'
import { endpoints } from './endpoints'
import { webURL } from './lib/webURL'
import { migrations } from './migrations'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const serverURL = process.env.NEXT_PUBLIC_SERVER_URL || webURL
const trustedOrigins = [...new Set([new URL(serverURL).origin, new URL(webURL).origin])]

if (process.env.NODE_ENV === 'production' && (!process.env.PAYLOAD_SECRET || process.env.PAYLOAD_SECRET.length < 32)) {
  // Fail closed rather than run with a weak/empty secret.
  console.warn('[config] PAYLOAD_SECRET is missing or shorter than 32 characters')
}

const useS3 = Boolean(process.env.MINIO_ENDPOINT && process.env.MINIO_BUCKET)

export default buildConfig({
  serverURL,
  cookiePrefix: 'psu-km',
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: { titleSuffix: ' — PSU Knowledge Admin' },
    components: {
      beforeLogin: ['@/components/admin/MockAuthNotice#MockAuthNotice'],
      beforeDashboard: ['@/components/admin/DashboardWelcome#DashboardWelcome'],
    },
  },
  i18n: {
    supportedLanguages: { th, en },
    fallbackLanguage: 'th',
  },
  collections: [
    Articles,
    Communities,
    Tags,
    Media,
    Comments,
    VerificationRequests,
    VerificationReviews,
    VerificationHistory,
    Notifications,
    Bookmarks,
    AuditLogs,
    Users,
  ],
  endpoints,
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  // Cookie-authenticated requests are only accepted from these origins (CSRF protection).
  csrf: trustedOrigins,
  cors: trustedOrigins,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  graphQL: { disable: true },
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL || '' },
    idType: 'uuid',
    // Schema changes always go through migrations (no dev "push") so every environment is identical.
    push: false,
    migrationDir: path.resolve(dirname, 'migrations'),
    prodMigrations: migrations,
  }),
  upload: {
    limits: { fileSize: MAX_UPLOAD_BYTES },
    abortOnLimit: true,
    responseOnLimit: 'ไฟล์มีขนาดเกิน 10 MB',
  },
  sharp,
  plugins: [
    s3Storage({
      enabled: useS3,
      collections: { media: true },
      bucket: process.env.MINIO_BUCKET || '',
      acl: 'private',
      config: {
        endpoint: process.env.MINIO_ENDPOINT,
        region: process.env.MINIO_REGION || 'us-east-1',
        forcePathStyle: true, // required for MinIO
        credentials: {
          accessKeyId: process.env.MINIO_ACCESS_KEY || '',
          secretAccessKey: process.env.MINIO_SECRET_KEY || '',
        },
      },
    }),
  ],
})
