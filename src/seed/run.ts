/** CLI entry: `pnpm seed` (= payload run src/seed/run.ts). Development only. */
import { getPayload } from 'payload'

import config from '@payload-config'
import { seed } from './index'

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
  throw new Error('Refusing to seed demo data in production (set ALLOW_DEMO_SEED=true to override).')
}
const password = process.env.SEED_DEMO_PASSWORD
if (!password || password.length < 10) throw new Error('SEED_DEMO_PASSWORD (>= 10 chars) must be set in .env')

const payload = await getPayload({ config })
await seed(payload, { password })
process.exit(0)
