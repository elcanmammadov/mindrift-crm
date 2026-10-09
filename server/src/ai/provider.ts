import { prisma } from '../db.js';
import { env } from '../env.js';
import type { ResultOrigin } from '../domain/enums.js';

/**
 * Provider-neutral AI adapter. The analysis engine only needs "send a system +
 * user prompt, get JSON text back". Swapping vendors means writing another
 * implementation of this interface.
 */
export interface AiProvider {
  readonly origin: Extract<ResultOrigin, 'REAL_AI' | 'MOCK'>;
  readonly model: string;
  completeJson(req: { system: string; user: string; maxTokens?: number }): Promise<string>;
}

export class AiError extends Error {
  constructor(
    public code: 'TIMEOUT' | 'API_ERROR' | 'RATE_LIMITED' | 'INVALID_JSON' | 'REFUSED' | 'NOT_CONFIGURED',
    message: string,
    public retryable = true,
  ) {
    super(message);
  }
}

export type AiMode = 'REAL' | 'DEMO';

let providerOverride: AiProvider | null = null;
/** Tests inject a mock provider here; it takes priority over env configuration. */
export function setProviderOverride(p: AiProvider | null) {
  providerOverride = p;
}

let realProvider: AiProvider | null = null;
async function getRealProvider(): Promise<AiProvider> {
  if (!realProvider) {
    const { AnthropicProvider } = await import('./anthropic.js');
    realProvider = new AnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL);
  }
  return realProvider;
}

export const hasApiKey = () => env.ANTHROPIC_API_KEY.trim().length > 0;

/** Admin can force demo mode at runtime (stored in AppSetting); env DEMO_MODE is the default. */
export async function getAiMode(): Promise<AiMode> {
  if (providerOverride) return 'REAL';
  if (!hasApiKey()) return 'DEMO';
  const pref = await prisma.appSetting.findUnique({ where: { key: 'aiMode' } });
  if (pref) return pref.value === 'REAL' ? 'REAL' : 'DEMO';
  return env.DEMO_MODE ? 'DEMO' : 'REAL';
}

/** Returns the live provider, or null in demo mode. */
export async function getProvider(): Promise<AiProvider | null> {
  if (providerOverride) return providerOverride;
  if ((await getAiMode()) === 'DEMO') return null;
  return getRealProvider();
}
