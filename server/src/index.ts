import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { env } from './env.js';
import { createApp } from './app.js';
import { getAiMode } from './ai/provider.js';
import { startTelegramPolling } from './modules/integrations.js';

const app = createApp();

// In production the built React app is served by the same process (one origin, one cookie).
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

startTelegramPolling();

app.listen(env.PORT, async () => {
  const mode = await getAiMode();
  console.log(`Mindrift CRM API on http://localhost:${env.PORT} — AI mode: ${mode}${mode === 'REAL' ? ` (${env.ANTHROPIC_MODEL})` : ''}`);
});
