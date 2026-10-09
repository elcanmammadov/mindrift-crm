import { createHash } from 'node:crypto';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const CHAR_MAP: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '‚': "'",
  '‛': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '«': '"',
  '»': '"',
  '–': '-',
  '—': '-',
  ' ': ' ',
  '…': '...',
};

/**
 * Normalizes text for quote matching and keeps a map from every normalized
 * character back to its offset in the original string.
 */
export function normalizeWithMap(input: string): { text: string; map: number[] } {
  let text = '';
  const map: number[] = [];
  let lastWasSpace = true;
  for (let i = 0; i < input.length; i++) {
    const ch = CHAR_MAP[input[i]!] ?? input[i]!;
    if (/\s/.test(ch)) {
      if (lastWasSpace) continue;
      text += ' ';
      map.push(i);
      lastWasSpace = true;
      continue;
    }
    for (const c of ch.toLocaleLowerCase('az')) {
      text += c;
      map.push(i);
    }
    lastWasSpace = false;
  }
  if (text.endsWith(' ')) {
    text = text.slice(0, -1);
    map.pop();
  }
  return { text, map };
}

export const normalize = (s: string) => normalizeWithMap(s).text;

/**
 * Finds an (allegedly) verbatim quote inside a source text.
 * Whitespace, quote styles and letter case are ignored; "..." inside a quote
 * is treated as an elision and every part must appear in order.
 * Returns original-text offsets, or null when the quote is not in the source.
 */
export function findQuote(source: string, quote: string): { start: number; end: number } | null {
  const src = normalizeWithMap(source);
  const parts = normalize(quote)
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .split(/\s*\.\.\.\s*/)
    .map((p) => p.trim().replace(/[.,;:!?]+$/, ''))
    .filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  // Very short fragments are too ambiguous to count as evidence.
  if (parts.join('').length < 8) return null;
  let from = 0;
  let start = -1;
  let end = -1;
  for (const part of parts) {
    const idx = src.text.indexOf(part, from);
    if (idx < 0) return null;
    if (start < 0) start = idx;
    end = idx + part.length;
    from = end;
  }
  return { start: src.map[start]!, end: src.map[end - 1]! + 1 };
}

const STOPWORDS = new Set(
  (
    'və ilə üçün bu o bir də da ki ya yaxud amma lakin çox daha artıq hələ nə necə niyə hansı harada biz siz onlar mən sən ' +
    'olan olur oldu olsun edir edək etdi etmək edilir edilməsi var yox deyil bəli xeyr salam hörmətli zəhmət olmasa təşəkkür ' +
    'bizim sizin bizə sizə əgər kimi sonra əvvəl indi artıq gün the and for with this that you are is to of in on be it as at by or our your from will can'
  ).split(/\s+/),
);

/** Crude token set used by the rule engine ("prefix stemming" absorbs Azerbaijani suffixes). */
export function keyTokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const raw of normalize(s).split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    out.add(raw.length > 5 ? raw.slice(0, 5) : raw);
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Share of `a`'s tokens that also occur in `b`. */
export function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / a.size;
}

export interface Sentence {
  text: string;
  start: number;
  end: number;
}

/** Splits text into sentences while keeping their original offsets. */
export function sentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  const re = /[^.!?\n]+[.!?]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const t = raw.trim();
    if (t.length < 3) continue;
    out.push({ text: t, start: m.index + lead, end: m.index + lead + t.length });
  }
  return out;
}
