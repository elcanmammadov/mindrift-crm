// Creates server/.env from .env.example on first setup (with a random SESSION_SECRET). Never overwrites.
import fs from 'node:fs';
import crypto from 'node:crypto';

const target = 'server/.env';
if (fs.existsSync(target)) {
  console.log(`${target} already exists — left unchanged.`);
} else {
  const example = fs.readFileSync('.env.example', 'utf8');
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(target, example.replace(/SESSION_SECRET=".*"/, `SESSION_SECRET="${secret}"`));
  console.log(`Created ${target} (demo mode; add ANTHROPIC_API_KEY for real AI).`);
}
