import { defineConfig } from 'vitest/config'

/** HTTP tests against the running Docker stack (PSU_KP_BASE_URL, default http://localhost:3000). */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/http/**/*.http.spec.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
  },
})
