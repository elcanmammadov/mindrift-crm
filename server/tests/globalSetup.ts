import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Creates a fresh SQLite database used only by the test suite (prisma/test.db).
 * The dev database (prisma/dev.db) is never touched.
 */
export default function setup() {
  const dbFile = path.resolve('prisma', 'test.db');
  for (const f of [dbFile, `${dbFile}-journal`]) fs.rmSync(f, { force: true });
  execSync('npx prisma db push --skip-generate', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: 'file:./test.db', PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
}
