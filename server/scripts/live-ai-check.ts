/**
 * Live check against the real Anthropic API (separate from the mocked test suite).
 * Runs the "Need ↔ proposal" module on the seeded main scenario and prints the
 * verified findings. Requires ANTHROPIC_API_KEY; without it, it says so and exits.
 *
 *   npm run test:live-ai
 */
import { env } from '../src/env.js';
import { prisma } from '../src/db.js';
import { AnthropicProvider } from '../src/ai/anthropic.js';
import { setProviderOverride } from '../src/ai/provider.js';
import { runModule } from '../src/analysis/engine.js';

async function main() {
  if (!env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY is not set — the real AI was NOT tested.');
    return;
  }
  const kase = await prisma.customerCase.findFirst({ where: { title: 'Onlayn mağaza saytı' } });
  if (!kase) {
    console.log('Seed data not found. Run `npm run db:seed` first.');
    return;
  }
  setProviderOverride(new AnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL));
  console.log(`Calling ${env.ANTHROPIC_MODEL} for module BRIDGE on "${kase.title}"...`);
  const result = await runModule(kase.id, 'BRIDGE', { type: 'SYSTEM', name: 'live-ai-check' }, { force: true });
  console.log(JSON.stringify(result, null, 2));
  const findings = await prisma.finding.findMany({
    where: { caseId: kase.id, module: 'BRIDGE', runId: result.runId },
    include: { evidence: true },
  });
  for (const f of findings) {
    const ok = f.evidence.filter((e) => e.verified).length;
    console.log(`- [${f.kind}] ${f.title} (${f.epistemic}, ${f.strength}) — verified quotes: ${ok}/${f.evidence.length}`);
  }
  if (result.status !== 'SUCCEEDED') process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
