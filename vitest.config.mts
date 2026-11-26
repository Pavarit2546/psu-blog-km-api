import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

/**
 * Integration tests run against the dedicated test database (APP_TEST_DB_NAME) and the
 * MinIO test bucket. They reset that database on start — never point them at real data.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globalSetup: ['./tests/int/globalSetup.ts'],
    setupFiles: ['./tests/int/env.ts', './tests/int/teardown.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
})
