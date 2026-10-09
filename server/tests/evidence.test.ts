import { describe, expect, it } from 'vitest';
import type { Source } from '@prisma/client';
import { findQuote } from '../src/lib/text.js';
import { processModuleOutput, guardContradiction, verifyEvidence } from '../src/analysis/evidence.js';

const src = (id: string, content: string, extra: Partial<Source> = {}): Source => ({
  id,
  caseId: 'c1',
  type: 'EMAIL',
  origin: 'MANUAL',
  title: id,
  author: 'A',
  authorSide: 'CUSTOMER',
  occurredAt: new Date('2026-01-01'),
  packageRef: null,
  content,
  contentHash: 'h',
  version: 1,
  deletedAt: null,
  createdById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...extra,
});

describe('quote verification', () => {
  const text = 'Salam.  Bizə sayt lazımdır.\nƏsas problemimiz odur ki, sifarişlər WhatsApp-da itir — hər gün.';

  it('finds verbatim quotes regardless of whitespace, case and dash style', () => {
    expect(findQuote(text, 'bizə sayt lazımdır')).not.toBeNull();
    expect(findQuote(text, 'sifarişlər   WhatsApp-da itir - hər gün')).not.toBeNull();
    const loc = findQuote(text, 'Əsas problemimiz odur ki')!;
    expect(text.slice(loc.start, loc.end)).toBe('Əsas problemimiz odur ki');
  });

  it('supports "..." elisions only when every part appears in order', () => {
    expect(findQuote(text, 'Bizə sayt ... WhatsApp-da itir')).not.toBeNull();
    expect(findQuote(text, 'WhatsApp-da itir ... Bizə sayt')).toBeNull();
  });

  it('rejects quotes that are not in the source and too-short fragments', () => {
    expect(findQuote(text, 'Bizə mobil tətbiq lazımdır')).toBeNull();
    expect(findQuote(text, 'sayt')).toBeNull();
  });

  it('records chunk ids and the exact original text for verified evidence', () => {
    const ev = verifyEvidence(src('s1', text), 'BİZƏ SAYT LAZIMDIR');
    expect(ev.verified).toBe(true);
    expect(ev.quote).toBe('Bizə sayt lazımdır');
    expect(ev.chunkId).toBe('s1:v1:0');
  });
});

describe('processing AI output', () => {
  const s1 = src('s1', 'Sifarişlər WhatsApp-da itir, menecerlər unudur.');
  const lookup = new Map([
    ['S1', s1],
    ['s1', s1],
  ]);

  it('drops references to non-existent sources and never counts unfound quotes as evidence', () => {
    const { findings, notes } = processModuleOutput(
      'BRIDGE',
      {
        findings: [
          {
            kind: 'CORE_PROBLEM',
            title: 'Sifarişlər itir',
            explanation: 'x',
            epistemic: 'OBSERVED',
            strength: 'STRONG',
            evidence: [
              { sourceRef: 'S9', quote: 'whatever text here', label: undefined },
              { sourceRef: 'S1', quote: 'müştəri bizi tərk edir', label: undefined },
            ],
            data: {},
            existingFindingId: undefined,
            suggestedAction: undefined,
            en: undefined,
          },
        ],
        missingInformation: [],
      },
      { sourceLookup: lookup },
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.evidence.every((e) => e.sourceId === 's1')).toBe(true);
    expect(findings[0]!.evidence[0]!.verified).toBe(false);
    // "Observed" without a verified quote is downgraded.
    expect(findings[0]!.epistemic).toBe('INFERRED');
    expect(findings[0]!.strength).toBe('WEAK');
    expect(notes.map((n) => n.code)).toEqual(expect.arrayContaining(['UNKNOWN_SOURCE_REF', 'UNVERIFIED_QUOTES']));
  });

  it('drops findings with a kind that does not belong to the module', () => {
    const { findings } = processModuleOutput(
      'BRIDGE',
      {
        findings: [
          { kind: 'CONTRADICTION', title: 't', explanation: 'e', epistemic: 'INFERRED', strength: 'WEAK', evidence: [], data: {}, existingFindingId: undefined, suggestedAction: undefined, en: undefined },
        ],
        missingInformation: [],
      },
      { sourceLookup: lookup },
    );
    expect(findings).toHaveLength(0);
  });
});

describe('contradiction guards (packages, dates, accepted changes)', () => {
  const a = src('a', 'Start paket: modul — 800 AZN.', { packageRef: 'Start', type: 'PROPOSAL' });
  const b = src('b', 'Biznes paket: modul — 1400 AZN.', { packageRef: 'Biznes', type: 'PROPOSAL' });
  const c = src('c', 'Biznes paket: modul — 1600 AZN.', { packageRef: ' biznes ', type: 'EMAIL', occurredAt: new Date('2026-02-01') });
  const lookup = new Map([
    ['a', a],
    ['b', b],
    ['c', c],
  ]);
  const ev = (s: Source, quote: string, label: string) => ({ ...verifyEvidence(s, quote), label });

  it('does not treat prices of different packages as a contradiction', () => {
    const r = guardContradiction(
      { kind: 'CONTRADICTION', evidence: [ev(a, 'modul — 800 AZN', 'A'), ev(b, 'modul — 1400 AZN', 'B')], data: { topic: 'PRICE' } },
      lookup,
    );
    expect(r).toEqual({ drop: 'DIFFERENT_PACKAGES' });
  });

  it('keeps a real contradiction within the same package (package names compared loosely)', () => {
    const r = guardContradiction(
      { kind: 'CONTRADICTION', evidence: [ev(b, 'modul — 1400 AZN', 'A'), ev(c, 'modul — 1600 AZN', 'B')], data: { topic: 'PRICE' } },
      lookup,
    );
    expect('drop' in r).toBe(false);
  });

  it('does not treat a later accepted change (agreed discount) as a contradiction', () => {
    const r = guardContradiction(
      { kind: 'CONTRADICTION', evidence: [ev(b, 'modul — 1400 AZN', 'A'), ev(c, 'modul — 1600 AZN', 'B')], data: { topic: 'PRICE', resolvedByLaterAgreement: true } },
      lookup,
    );
    expect(r).toEqual({ drop: 'ACCEPTED_LATER_CHANGE' });
  });

  it('turns "cannot tell which applies" into a clarification request', () => {
    const r = guardContradiction(
      { kind: 'CONTRADICTION', evidence: [ev(b, 'modul — 1400 AZN', 'A'), ev(c, 'modul — 1600 AZN', 'B')], data: { topic: 'PRICE', effectiveStatus: 'UNKNOWN_WHICH_APPLIES' } },
      lookup,
    );
    expect(r).toMatchObject({ kind: 'NEEDS_CLARIFICATION' });
  });

  it('requires two verified quotes', () => {
    const r = guardContradiction(
      { kind: 'CONTRADICTION', evidence: [ev(b, 'modul — 1400 AZN', 'A'), ev(c, 'bu mətn mənbədə yoxdur', 'B')], data: { topic: 'PRICE' } },
      lookup,
    );
    expect(r).toEqual({ drop: 'CONTRADICTION_WITHOUT_TWO_QUOTES' });
  });
});
