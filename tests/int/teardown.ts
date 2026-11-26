import { afterAll } from 'vitest'

import { closePayload } from './helpers'

// Close the DB pool after each test file so the runner can exit cleanly.
afterAll(async () => {
  await closePayload()
})
