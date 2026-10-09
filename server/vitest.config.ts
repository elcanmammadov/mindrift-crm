import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './tests/globalSetup.ts',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'file:./test.db',
      SESSION_SECRET: 'test-secret-test-secret-test-secret',
      // Tests never call the real API; AI behaviour is exercised through MockProvider.
      ANTHROPIC_API_KEY: '',
      DEMO_MODE: 'true',
      FRONTEND_URL: 'http://localhost:5173',
    },
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
