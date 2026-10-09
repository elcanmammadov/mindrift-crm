import type { AiProvider } from './provider.js';

/**
 * Deterministic provider for automated tests. `respond` receives the prompts and
 * returns the raw text the "model" would send back (valid JSON or not).
 */
export class MockProvider implements AiProvider {
  readonly origin = 'MOCK' as const;
  readonly model = 'mock-model';
  calls: { system: string; user: string }[] = [];

  constructor(private respond: (req: { system: string; user: string }) => string | Promise<string>) {}

  async completeJson(req: { system: string; user: string }): Promise<string> {
    this.calls.push(req);
    return this.respond(req);
  }
}
