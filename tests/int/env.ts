import { config as loadEnv } from 'dotenv'

loadEnv({ quiet: true } as never)

/** Point everything at the test database and test bucket. */
const url = new URL(process.env.DATABASE_URL ?? '')
url.pathname = `/${process.env.APP_TEST_DB_NAME || 'psu_kp_test'}`
if (url.pathname === '/psu_kp' || !url.pathname.includes('test')) {
  throw new Error('Refusing to run integration tests against a non-test database')
}
process.env.DATABASE_URL = url.toString()
process.env.MINIO_BUCKET = process.env.MINIO_TEST_BUCKET || 'psu-knowledge-media-test'
process.env.SEED_DEMO_PASSWORD = 'Test-only-password-1!'

