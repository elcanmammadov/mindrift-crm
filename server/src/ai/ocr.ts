import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env.js';
import { AiError } from './provider.js';

export const OCR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type OcrMime = (typeof OCR_MIME_TYPES)[number];

const SYSTEM = `You are an OCR engine. Transcribe ALL text visible in the image exactly as written, in its original language (often Azerbaijani, Russian or English).
- Keep line breaks, lists and table rows in reading order; render tables as lines with " | " between cells.
- Do not translate, summarise, correct or comment. No preamble, no markdown fences.
- Mark unreadable words as [?].
- If the image contains no readable text, answer with exactly: NO_TEXT`;

/** Reads the text from a photographed document (Claude vision). The text is only returned for the user to review — nothing is stored here. */
export async function extractImageText(buffer: Buffer, mimetype: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new AiError('NOT_CONFIGURED', 'ANTHROPIC_API_KEY is not set', false);
  if (!OCR_MIME_TYPES.includes(mimetype as OcrMime)) throw new AiError('API_ERROR', 'Unsupported image type', false);
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: env.AI_TIMEOUT_MS, maxRetries: 2 });
  try {
    const message = await client.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimetype as OcrMime, data: buffer.toString('base64') } },
            { type: 'text', text: 'Transcribe this document.' },
          ],
        },
      ],
    });
    if (message.stop_reason === 'refusal') throw new AiError('REFUSED', 'The model declined this request.', false);
    let text = '';
    for (const block of message.content) if (block.type === 'text') text += block.text;
    text = text.trim();
    return text === 'NO_TEXT' ? '' : text;
  } catch (err) {
    if (err instanceof AiError) throw err;
    if (err instanceof Anthropic.APIConnectionTimeoutError) throw new AiError('TIMEOUT', 'AI request timed out.');
    if (err instanceof Anthropic.RateLimitError) throw new AiError('RATE_LIMITED', 'AI rate limit reached, retry later.');
    if (err instanceof Anthropic.AuthenticationError) throw new AiError('NOT_CONFIGURED', 'Invalid ANTHROPIC_API_KEY.', false);
    if (err instanceof Anthropic.APIError) throw new AiError('API_ERROR', `AI API error ${err.status ?? ''}: ${err.message}`);
    if (err instanceof Anthropic.APIConnectionError) throw new AiError('API_ERROR', 'Could not reach the AI API.');
    throw err;
  }
}
