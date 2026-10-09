import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env.js';
import { AiError, type AiProvider } from './provider.js';

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_MODELS = ['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'];

export class AnthropicProvider implements AiProvider {
  readonly origin = 'REAL_AI' as const;
  private client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    if (!apiKey) throw new AiError('NOT_CONFIGURED', 'ANTHROPIC_API_KEY is not set', false);
    // The SDK retries 408/409/429/5xx and connection errors (maxRetries) with backoff.
    this.client = new Anthropic({ apiKey, timeout: env.AI_TIMEOUT_MS, maxRetries: 2 });
  }

  async completeJson(req: { system: string; user: string; maxTokens?: number }): Promise<string> {
    const base = {
      model: this.model,
      max_tokens: req.maxTokens ?? 16000,
      system: req.system,
      messages: [{ role: 'user' as const, content: req.user }],
      output_config: { effort: 'medium' as const },
    };
    try {
      // Streaming avoids HTTP timeouts on long inputs; finalMessage() collects the full response.
      const message = FALLBACK_MODELS.includes(this.model)
        ? await this.client.beta.messages
            .stream({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
            .finalMessage()
        : await this.client.messages.stream(base).finalMessage();

      if (message.stop_reason === 'refusal') {
        throw new AiError('REFUSED', 'The model declined this request.', false);
      }
      if (message.stop_reason === 'max_tokens') {
        throw new AiError('INVALID_JSON', 'The model response was cut off (max_tokens).');
      }
      let text = '';
      for (const block of message.content as { type: string; text?: string }[]) {
        if (block.type === 'text' && block.text) text += block.text;
      }
      return text;
    } catch (err) {
      if (err instanceof AiError) throw err;
      if (err instanceof Anthropic.APIConnectionTimeoutError) throw new AiError('TIMEOUT', 'AI request timed out.');
      if (err instanceof Anthropic.RateLimitError) throw new AiError('RATE_LIMITED', 'AI rate limit reached, retry later.');
      if (err instanceof Anthropic.AuthenticationError)
        throw new AiError('NOT_CONFIGURED', 'Invalid ANTHROPIC_API_KEY.', false);
      if (err instanceof Anthropic.BadRequestError) throw new AiError('API_ERROR', `AI request rejected: ${err.message}`, false);
      if (err instanceof Anthropic.APIError) throw new AiError('API_ERROR', `AI API error ${err.status ?? ''}: ${err.message}`);
      if (err instanceof Anthropic.APIConnectionError) throw new AiError('API_ERROR', 'Could not reach the AI API.');
      throw err;
    }
  }
}
