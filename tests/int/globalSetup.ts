/** Resets the TEST database, runs all migrations and loads the synthetic seed once. */
export default async function setup() {
  await import('./env')
  const { getPayload } = await import('payload')
  const config = (await import('../../src/payload.config')).default
  const { seed } = await import('../../src/seed/index')
  const payload = await getPayload({ config })
  await payload.db.migrateFresh({ forceAcceptWarning: true })
  await seed(payload, { password: process.env.SEED_DEMO_PASSWORD! })
  await payload.destroy()
}
