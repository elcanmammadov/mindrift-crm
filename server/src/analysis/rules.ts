/**
 * Limited rule-based analysis used in DEMO mode for data that has no prepared
 * demo result. It is deliberately conservative: keyword/regex heuristics, every
 * finding carries a verbatim quote, and the UI labels the output as
 * "rule-based, not AI".
 */
import type { Blocker, CustomerConfirmation, ResolutionCriterion, Source } from '@prisma/client';
import { keyTokens, jaccard, overlapRatio, sentences, normalize, type Sentence } from '../lib/text.js';
import type { BlockerCategory } from '../domain/enums.js';
import type { CaseContext } from './context.js';
import type { FindingOut, ModuleOut } from './schemas.js';

type F = FindingOut;

const cut = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function finding(p: {
  kind: string;
  title: string;
  explanation: string;
  epistemic?: 'OBSERVED' | 'INFERRED';
  strength?: 'STRONG' | 'MEDIUM' | 'WEAK';
  suggestedAction?: string;
  evidence?: { sourceRef: string; quote: string; label?: string }[];
  data?: Record<string, unknown>;
  en: { title: string; explanation: string; suggestedAction?: string };
}): F {
  return {
    existingFindingId: undefined,
    kind: p.kind,
    title: p.title,
    explanation: p.explanation,
    epistemic: p.epistemic ?? 'OBSERVED',
    strength: p.strength ?? 'WEAK',
    suggestedAction: p.suggestedAction,
    evidence: (p.evidence ?? []).map((e) => ({ ...e, label: e.label })),
    data: p.data ?? {},
    en: p.en,
  };
}

interface SSent extends Sentence {
  source: Source;
}

function sentencesOf(sources: Source[], side?: 'CUSTOMER' | 'COMPANY'): SSent[] {
  return sources
    .filter((s) => !side || s.authorSide === side)
    .flatMap((s) => sentences(s.content).map((x) => ({ ...x, source: s })));
}

const ctxSources = (ctx: CaseContext) => ctx.sources.map((s) => s.source);

// ---------------------------------------------------------------- BRIDGE
const REQUEST_RE = /(istəyirik|istəyirəm|lazımdır|lazımdı|ehtiyacımız|sifariş etmək istə|hazırlamaq istə)/i;
const PROBLEM_RE = /(problem|itir|gecik|çətin|unudul|qarışır|qarışıq|əl ilə|vaxt aparır|şikayət|səhv)/i;
const BUDGET_RE = /(büdcə|\d[\d\s]*\s*(azn|manat))/i;
const TIME_RE = /(\d+\s*(gün|həftə|ay)\s*(ərzində|içində|sonra)?|ayın sonuna|tarixinə qədər|bayramdan əvvəl)/i;

export function bridgeRules(ctx: CaseContext): ModuleOut {
  const all = ctxSources(ctx);
  const cust = sentencesOf(all, 'CUSTOMER');
  const out: F[] = [];
  const missing: string[] = ['Qayda əsaslı rejim ehtiyac ilə təklifin məna uyğunluğunu tam qiymətləndirə bilmir; dəqiq müqayisə üçün real AI rejimi lazımdır.'];

  if (cust.length === 0) {
    missing.push('Müştəri tərəfindən yazılmış mənbə yoxdur — ehtiyacı müəyyən etmək mümkün deyil.');
    return { findings: [], missingInformation: missing };
  }
  const requests = cust.filter((s) => REQUEST_RE.test(s.text)).slice(0, 3);
  for (const s of requests)
    out.push(
      finding({
        kind: 'EXPLICIT_REQUEST',
        title: `Müştərinin istəyi: ${cut(s.text, 70)}`,
        explanation: 'Müştəri mesajında açıq ifadə edilmiş istək (qayda əsaslı çıxarış).',
        strength: 'MEDIUM',
        evidence: [{ sourceRef: s.source.id, quote: s.text }],
        en: { title: `Customer request: ${cut(s.text, 70)}`, explanation: 'Request stated explicitly in a customer message (rule-based extraction).' },
      }),
    );
  const problems = cust.filter((s) => PROBLEM_RE.test(s.text)).slice(0, 3);
  for (const s of problems)
    out.push(
      finding({
        kind: 'CORE_PROBLEM',
        title: `Bildirilən problem: ${cut(s.text, 70)}`,
        explanation: 'Müştəri problem kimi təsvir etdiyi vəziyyəti yazıb. Bunun əsas problem olub-olmadığını əməkdaş təsdiqləməlidir.',
        strength: 'MEDIUM',
        evidence: [{ sourceRef: s.source.id, quote: s.text }],
        suggestedAction: 'Müştəri ilə bunun əsas problem olduğunu dəqiqləşdirin.',
        en: {
          title: `Reported problem: ${cut(s.text, 70)}`,
          explanation: 'The customer described this as a problem. An employee should confirm whether it is the core problem.',
          suggestedAction: 'Confirm with the customer that this is the core problem.',
        },
      }),
    );
  for (const s of cust.filter((x) => BUDGET_RE.test(x.text)).slice(0, 1))
    out.push(
      finding({
        kind: 'CONSTRAINT',
        title: `Büdcə məhdudiyyəti: ${cut(s.text, 60)}`,
        explanation: 'Müştəri büdcə və ya məbləğ qeyd edib.',
        evidence: [{ sourceRef: s.source.id, quote: s.text }],
        data: { constraintType: 'BUDGET' },
        en: { title: `Budget constraint: ${cut(s.text, 60)}`, explanation: 'The customer mentioned a budget or amount.' },
      }),
    );
  for (const s of cust.filter((x) => TIME_RE.test(x.text)).slice(0, 1))
    out.push(
      finding({
        kind: 'CONSTRAINT',
        title: `Vaxt məhdudiyyəti: ${cut(s.text, 60)}`,
        explanation: 'Müştəri müddət və ya tarix qeyd edib.',
        evidence: [{ sourceRef: s.source.id, quote: s.text }],
        data: { constraintType: 'TIME' },
        en: { title: `Time constraint: ${cut(s.text, 60)}`, explanation: 'The customer mentioned a deadline or duration.' },
      }),
    );

  const proposals = all.filter((s) => s.type === 'PROPOSAL' || s.type === 'CONTRACT');
  if (proposals.length === 0) {
    missing.push('İşdə təklif və ya müqavilə mənbəsi yoxdur — təkliflə müqayisə aparılmadı.');
  } else {
    const propTokens = keyTokens(proposals.map((p) => p.content).join('\n'));
    for (const s of problems) {
      const ratio = overlapRatio(keyTokens(s.text), propTokens);
      if (ratio < 0.25) {
        out.push(
          finding({
            kind: 'GAP',
            title: `Təklifdə əks olunmayan problem: ${cut(s.text, 60)}`,
            explanation:
              'Müştərinin bildirdiyi problemin açar sözləri təklif mətnində demək olar ki, yoxdur. Bu, təklifin bu problemi həll etmədiyinə işarə ola bilər (qayda əsaslı ehtimal).',
            epistemic: 'INFERRED',
            evidence: [{ sourceRef: s.source.id, quote: s.text }],
            suggestedAction: 'Təklifə bu problemi həll edən hissə əlavə etməyi və ya müştəri ilə prioriteti dəqiqləşdirməyi nəzərdən keçirin.',
            en: {
              title: `Problem not reflected in the proposal: ${cut(s.text, 60)}`,
              explanation: "The key words of the customer's problem barely appear in the proposal. This may indicate the proposal does not address it (rule-based guess).",
              suggestedAction: 'Consider adding a part that addresses this problem, or clarify priorities with the customer.',
            },
          }),
        );
        out.push(
          finding({
            kind: 'QUESTION_TO_ASK',
            title: 'Bu problemin həlli təklifin bir hissəsi olmalıdırmı?',
            explanation: `Müştərinin yazdığı "${cut(s.text, 80)}" problemi təklifdə görünmür.`,
            epistemic: 'INFERRED',
            evidence: [{ sourceRef: s.source.id, quote: s.text }],
            en: {
              title: 'Should solving this problem be part of the proposal?',
              explanation: `The problem the customer wrote ("${cut(s.text, 80)}") does not appear in the proposal.`,
            },
          }),
        );
      }
    }
  }
  return { findings: out, missingInformation: missing };
}

// ---------------------------------------------------------------- ONEVOICE
const TOPIC_STEMS: Record<string, string[]> = {
  inteqrasiya: ['inteqrasiya', 'integration'],
  dəstək: ['dəstək'],
  hosting: ['hostinq', 'hosting'],
  domen: ['domen'],
  quraşdırma: ['quraşdırma'],
  təlim: ['təlim'],
  sayt: ['sayt'],
  modul: ['modul'],
  lisenziya: ['lisenziya'],
  abunə: ['abunə'],
};
const CHANGE_RE = /(endirim|razılaşdırıl|yenilənmiş|yeniləndi|əlavə razılaşma|düzəliş|dəyişdirildi|əvəzinə)/i;
const AMOUNT_RE = /(\d[\d\s.,]*)\s*(azn|manat|₼)/i;
const FREE_RE = /\bpulsuz\b|ödənişsiz|heç bir əlavə ödəniş/i;

interface Statement {
  s: SSent;
  topic: string;
  topicKind: 'PRICE' | 'SUPPORT_PERIOD' | 'DELIVERY_DATE';
  value: string;
}

function priceStatements(all: SSent[]): Statement[] {
  const out: Statement[] = [];
  for (const s of all) {
    const low = normalize(s.text);
    const amount = AMOUNT_RE.exec(low);
    const free = FREE_RE.exec(low);
    if (!amount && !free) continue;
    const pos = (amount ?? free)!.index;
    let best: { topic: string; dist: number } | null = null;
    for (const [topic, stems] of Object.entries(TOPIC_STEMS)) {
      for (const st of stems) {
        const i = low.indexOf(st);
        if (i >= 0 && (!best || Math.abs(i - pos) < best.dist)) best = { topic, dist: Math.abs(i - pos) };
      }
    }
    if (!best) continue;
    const value = amount ? `${amount[1]!.replace(/[\s.,]/g, '')} AZN` : 'FREE';
    out.push({ s, topic: best.topic, topicKind: 'PRICE', value });
  }
  return out;
}

function periodStatements(all: SSent[]): Statement[] {
  const out: Statement[] = [];
  for (const s of all) {
    const low = normalize(s.text);
    const sup = /(\d+)\s*(ay|il)/.exec(low);
    if (sup && low.includes('dəstək')) {
      const months = Number(sup[1]) * (sup[2] === 'il' ? 12 : 1);
      out.push({ s, topic: 'dəstək müddəti', topicKind: 'SUPPORT_PERIOD', value: `${months} ay` });
    }
    const del = /(\d+)\s*(iş\s*)?(gün|həftə)/.exec(low);
    if (del && /(təhvil|hazır|müddət|tamamla|istifadəyə ver)/.test(low)) {
      const days = Number(del[1]) * (del[3] === 'həftə' ? 7 : 1);
      out.push({ s, topic: 'təhvil müddəti', topicKind: 'DELIVERY_DATE', value: `${days} gün` });
    }
  }
  return out;
}

export function onevoiceRules(ctx: CaseContext): ModuleOut {
  const all = sentencesOf(ctxSources(ctx));
  const stmts = [...priceStatements(all), ...periodStatements(all)];
  const out: F[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < stmts.length; i++) {
    for (let j = i + 1; j < stmts.length; j++) {
      const a = stmts[i]!;
      const b = stmts[j]!;
      if (a.topic !== b.topic || a.topicKind !== b.topicKind || a.value === b.value) continue;
      if (a.s.source.id === b.s.source.id) continue;
      const [first, later] = a.s.source.occurredAt <= b.s.source.occurredAt ? [a, b] : [b, a];
      const key = `${first.topic}|${first.value}|${later.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // A later statement that explicitly describes an agreed change is not a contradiction.
      const accepted = CHANGE_RE.test(later.s.text) || (later.s.source.type === 'CONTRACT' && CHANGE_RE.test(later.s.source.content));
      const valueText = (v: string) => (v === 'FREE' ? 'pulsuz' : v);
      const valueTextEn = (v: string) => (v === 'FREE' ? 'free' : v);
      out.push(
        finding({
          kind: 'CONTRADICTION',
          title: `${first.topic}: "${valueText(first.value)}" və "${valueText(later.value)}" fərqlidir`,
          explanation: `${first.s.source.author} (${first.s.source.occurredAt.toISOString().slice(0, 10)}) "${valueText(first.value)}" yazıb, ${later.s.source.author} (${later.s.source.occurredAt.toISOString().slice(0, 10)}) isə "${valueText(later.value)}". Hansının qüvvədə olduğu insan tərəfindən yoxlanmalıdır.`,
          strength: 'MEDIUM',
          evidence: [
            { sourceRef: first.s.source.id, quote: first.s.text, label: 'A' },
            { sourceRef: later.s.source.id, quote: later.s.text, label: 'B' },
          ],
          suggestedAction: 'Müştəriyə hansı şərtin keçərli olduğunu yazılı şəkildə dəqiqləşdirin və təklifi/müqaviləni uyğunlaşdırın.',
          data: {
            topic: first.topicKind,
            impact: 'Müştəri fərqli şərt gözləyə bilər; hesab və ya təhvil zamanı narazılıq yarana bilər.',
            effectiveStatus: 'CONFLICT',
            resolvedByLaterAgreement: accepted,
          },
          en: {
            title: `${first.topic}: "${valueTextEn(first.value)}" vs "${valueTextEn(later.value)}"`,
            explanation: `${first.s.source.author} wrote "${valueTextEn(first.value)}", later ${later.s.source.author} wrote "${valueTextEn(later.value)}". A human should check which one applies.`,
            suggestedAction: 'Clarify in writing which term applies and align the proposal/contract.',
          },
        }),
      );
    }
  }
  return {
    findings: out,
    missingInformation:
      out.length === 0 ? ['Qayda əsaslı rejim yalnız qiymət, dəstək müddəti və təhvil müddəti kimi rəqəmli ifadələri müqayisə edir.'] : [],
  };
}

// ---------------------------------------------------------------- UNBLOCK
const CATEGORY_RULES: [BlockerCategory, RegExp][] = [
  ['DATA_MIGRATION', /(köçür|miqrasiya|köhnə məlumat|excel.*(məlumat|baza)|bazanı)/i],
  ['SECURITY', /(təhlükəsiz|məxfi|şifrə|qorunur|gdpr|şəxsi məlumat)/i],
  ['BUDGET', /(büdcə|baha|qiymət yüksək|ödəyə bilmə)/i],
  ['INTERNAL_APPROVAL', /(rəhbərlik|direktor|təsdiq(lə)?məlidir|təsdiqini gözlə|idarə heyəti)/i],
  ['TECH_FIT', /(uyğun deyil|inteqrasiya olunurmu|işləyəcəkmi|dəstəkləyirmi|api)/i],
  ['UNCLEAR_TERMS', /(şərtlər aydın deyil|nə daxildir|daxildirmi)/i],
];
const categorize = (t: string): BlockerCategory => CATEGORY_RULES.find(([, re]) => re.test(t))?.[0] ?? 'UNANSWERED_QUESTION';
const STATEMENT_BLOCKER_RE = /(büdcə(miz)? (yoxdur|azdır|çatmır)|rəhbərlik.*təsdiq|təsdiq(lə)?məlidir|təhlükəsizlik.*(narahat|sual)|uyğun deyil)/i;
const RESOLUTION_RE = /(həll olun|cavab ver|razıyıq|razılaşdıq|təsdiqlə|köçürəcəyik|köçürüləcək|hazırdır|aydın oldu|tamamlandı)/i;

export function unblockRules(ctx: CaseContext, openBlockers: { alias: string; blocker: Blocker }[]): ModuleOut {
  const all = ctxSources(ctx);
  const out: F[] = [];
  const blockerTokens = openBlockers.map((b) => keyTokens(`${b.blocker.title} ${b.blocker.evidenceQuote ?? ''}`));
  const coveredByOpen = (t: string) => blockerTokens.some((bt) => overlapRatio(keyTokens(t), bt) >= 0.5);

  for (const s of sentencesOf(all, 'CUSTOMER')) {
    const isQuestion = s.text.trim().endsWith('?');
    const isStatement = !isQuestion && STATEMENT_BLOCKER_RE.test(s.text);
    if (!isQuestion && !isStatement) continue;
    if (coveredByOpen(s.text)) continue;
    const qTokens = keyTokens(s.text);
    if (qTokens.size < 2) continue;
    if (isQuestion) {
      const answered = all.some(
        (later) =>
          later.authorSide === 'COMPANY' && later.occurredAt > s.source.occurredAt && overlapRatio(qTokens, keyTokens(later.content)) >= 0.5,
      );
      if (answered) continue;
    }
    const category = isQuestion ? categorize(s.text) : categorize(s.text) === 'UNANSWERED_QUESTION' ? 'OTHER' : categorize(s.text);
    out.push(
      finding({
        kind: 'BLOCKER',
        title: isQuestion ? `Cavabsız sual: ${cut(s.text, 70)}` : `Maneə: ${cut(s.text, 70)}`,
        explanation: isQuestion
          ? 'Müştərinin sualına sonrakı şirkət mesajlarında cavab tapılmadı (açar söz uyğunluğu ilə yoxlanıb).'
          : 'Müştəri irəliləməyə mane olan şərt bildirib.',
        strength: 'MEDIUM',
        evidence: [{ sourceRef: s.source.id, quote: s.text }],
        suggestedAction: isQuestion ? 'Müştərinin sualını yazılı cavablandırın.' : 'Maneəni aradan qaldırmaq üçün məsul şəxs təyin edin.',
        data: {
          category,
          nextStep: isQuestion ? 'Sualı yazılı cavablandırmaq' : 'Müştəri ilə maneəni müzakirə etmək',
          resolutionCriteria: isQuestion ? 'Müştəri cavabı alıb və əlavə sualı qalmayıb' : 'Müştəri maneənin aradan qalxdığını təsdiqləyir',
          suggestedDueDays: 2,
          en: {
            nextStep: isQuestion ? 'Answer the question in writing' : 'Discuss the blocker with the customer',
            resolutionCriteria: isQuestion ? 'Customer received an answer and has no follow-up' : 'Customer confirms the blocker is removed',
          },
        },
        en: {
          title: isQuestion ? `Unanswered question: ${cut(s.text, 70)}` : `Blocker: ${cut(s.text, 70)}`,
          explanation: isQuestion
            ? 'No answer to this customer question was found in later company messages (keyword check).'
            : 'The customer stated a condition that stops progress.',
          suggestedAction: isQuestion ? 'Answer the customer question in writing.' : 'Assign an owner to remove this blocker.',
        },
      }),
    );
  }

  // Suggest possible resolution of open blockers from newer messages (never closes them).
  for (const [i, ob] of openBlockers.entries()) {
    const anchorSource = all.find((s) => s.id === ob.blocker.sourceId);
    const after = anchorSource?.occurredAt ?? ob.blocker.createdAt;
    for (const s of sentencesOf(all.filter((x) => x.occurredAt > after))) {
      if (!RESOLUTION_RE.test(s.text)) continue;
      if (overlapRatio(blockerTokens[i]!, keyTokens(s.text)) < 0.3) continue;
      out.push(
        finding({
          kind: 'BLOCKER_RESOLUTION',
          title: `Maneə həll oluna bilər: ${cut(ob.blocker.title, 60)}`,
          explanation: 'Yeni mesajda bu maneənin həll olunduğuna işarə ola bilər. Maneəni bağlamaq üçün insan təsdiqi lazımdır.',
          epistemic: 'INFERRED',
          evidence: [{ sourceRef: s.source.id, quote: s.text }],
          data: { blockerRef: ob.alias },
          en: {
            title: `Blocker may be resolved: ${cut(ob.blocker.title, 60)}`,
            explanation: 'A newer message may indicate this blocker is resolved. A human must confirm before it is closed.',
          },
        }),
      );
      break;
    }
  }
  return { findings: out, missingInformation: [] };
}

// ---------------------------------------------------------------- LOOP
export function loopRules(ctx: CaseContext): ModuleOut {
  const out: F[] = [];
  const cur = ctx.caseRow;
  const curCustomerSentences = sentencesOf(ctxSources(ctx), 'CUSTOMER');
  const curTokens = keyTokens(`${cur.title} ${cur.initialRequest} ${cur.coreNeed ?? ''}`);
  for (const r of ctx.related) {
    const relTokens = keyTokens(`${r.caseRow.title} ${r.caseRow.initialRequest} ${r.caseRow.coreNeed ?? ''}`);
    const sim = jaccard(curTokens, relTokens);
    if (sim < 0.2) continue;
    const relSources = r.sources.map((s) => s.source);
    const bestCur = curCustomerSentences
      .map((s) => ({ s, score: overlapRatio(keyTokens(s.text), relTokens) }))
      .sort((a, b) => b.score - a.score)[0];
    const bestRel = sentencesOf(relSources, 'CUSTOMER')
      .map((s) => ({ s, score: overlapRatio(keyTokens(s.text), curTokens) }))
      .sort((a, b) => b.score - a.score)[0];
    const lastCompany = [...relSources].reverse().find((s) => s.authorSide === 'COMPANY');
    const previousSolution = r.caseRow.closeReason ?? (lastCompany ? cut(sentences(lastCompany.content)[0]?.text ?? '', 160) : undefined);
    const evidence = [
      ...(bestCur && bestCur.score > 0 ? [{ sourceRef: bestCur.s.source.id, quote: bestCur.s.text }] : []),
      ...(bestRel && bestRel.score > 0 ? [{ sourceRef: bestRel.s.source.id, quote: bestRel.s.text }] : []),
    ];
    out.push(
      finding({
        kind: 'REPEAT_CANDIDATE',
        title: `Əvvəlki işlə oxşarlıq: "${cut(r.caseRow.title, 60)}"`,
        explanation: `İşin başlığı və ilkin müraciəti əvvəlki işlə ortaq açar sözlərə malikdir (oxşarlıq: ${sim >= 0.4 ? 'yüksək' : 'orta'}). Eyni mövzu hər zaman eyni problem demək deyil — əməkdaş təsdiqləməlidir.`,
        epistemic: 'INFERRED',
        strength: sim >= 0.4 ? 'MEDIUM' : 'WEAK',
        evidence,
        suggestedAction: 'Əvvəlki işin həllini yoxlayın; eyni problemdirsə əlaqələndirin və əsas səbəb üçün tapşırıq yaradın.',
        data: {
          relatedCaseRef: r.alias,
          previousSolution,
          rootCauseSuggestion: 'Əvvəlki həllin niyə davamlı olmadığını araşdırın (konfiqurasiya, təlim, proses).',
          certainty: sim >= 0.4 ? 'LIKELY' : 'UNCERTAIN',
        },
        en: {
          title: `Similar to an earlier case: "${cut(r.caseRow.title, 60)}"`,
          explanation: 'The title and initial request share key words with an earlier case. The same topic is not always the same problem — an employee should confirm.',
          suggestedAction: 'Check how the earlier case was solved; if it is the same problem, link them and create a root-cause task.',
        },
      }),
    );
  }
  return { findings: out, missingInformation: ctx.related.length === 0 ? ['Bu müştərinin başqa işi yoxdur.'] : [] };
}

// ---------------------------------------------------------------- PROOFCLOSE
export function proofcloseRules(
  criteria: { alias: string; c: ResolutionCriterion }[],
  confirmations: CustomerConfirmation[],
): ModuleOut {
  const latest = [...confirmations].sort((a, b) => +b.createdAt - +a.createdAt)[0];
  const needsCustomer = criteria.some((k) => k.c.requiresCustomerConfirmation);
  const statuses = criteria.map((k) => {
    let status = k.c.status as 'PENDING' | 'MET' | 'NOT_MET';
    if (k.c.requiresCustomerConfirmation && status === 'MET' && latest?.outcome !== 'RESOLVED') status = 'PENDING';
    if (k.c.requiresCustomerConfirmation && latest?.outcome === 'PROBLEM_REMAINS') status = 'NOT_MET';
    return { criterionRef: k.alias, status, note: k.c.evidenceNote ?? undefined };
  });
  let verdict: 'SUPPORTED' | 'INSUFFICIENT' | 'UNRESOLVED' = 'INSUFFICIENT';
  if (statuses.some((s) => s.status === 'NOT_MET')) verdict = 'UNRESOLVED';
  else if (statuses.length > 0 && statuses.every((s) => s.status === 'MET')) verdict = 'SUPPORTED';
  const az = { SUPPORTED: 'Həll sübutlarla dəstəklənir', INSUFFICIENT: 'Sübut kifayət deyil', UNRESOLVED: 'Həll edilməmiş məsələ qalır' }[verdict];
  const en = { SUPPORTED: 'Resolution is supported by evidence', INSUFFICIENT: 'Not enough evidence', UNRESOLVED: 'An unresolved issue remains' }[verdict];
  return {
    findings: [
      finding({
        kind: 'VERDICT',
        title: az,
        explanation: `Qayda əsaslı yoxlama: meyarların insan tərəfindən qeyd olunmuş statusları${needsCustomer ? ' və müştəri təsdiqi' : ''} əsasında. ${statuses.filter((s) => s.status === 'MET').length}/${statuses.length} meyar yerinə yetirilib.`,
        epistemic: 'INFERRED',
        strength: 'MEDIUM',
        data: { verdict, criteria: statuses },
        en: {
          title: en,
          explanation: `Rule-based check using the criterion statuses recorded by staff${needsCustomer ? ' and customer confirmation' : ''}. ${statuses.filter((s) => s.status === 'MET').length}/${statuses.length} criteria met.`,
        },
      }),
    ],
    missingInformation: criteria.length === 0 ? ['Həll meyarları təyin edilməyib.'] : [],
  };
}

// ---------------------------------------------------------------- WHYLOST
export interface ReplyGap {
  customerSource: Source;
  companySource: Source | null;
  hours: number;
}

/** For each customer message: how long until the next company message (system-computed fact). */
export function computeReplyGaps(sources: Source[], now = new Date()): ReplyGap[] {
  const sorted = [...sources].sort((a, b) => +a.occurredAt - +b.occurredAt);
  const gaps: ReplyGap[] = [];
  for (const [i, s] of sorted.entries()) {
    if (s.authorSide !== 'CUSTOMER') continue;
    if (sorted[i + 1]?.authorSide === 'CUSTOMER') continue; // consecutive customer messages: measure from the last one
    const reply = sorted.slice(i + 1).find((x) => x.authorSide === 'COMPANY') ?? null;
    const end = reply?.occurredAt ?? now;
    gaps.push({ customerSource: s, companySource: reply, hours: Math.round((+end - +s.occurredAt) / 36e5) });
  }
  return gaps;
}

const STATED_REASON_RE = /(qiymət|baha|büdcə|rəqib|başqa şirkət|digər şirkət|gecik|cavab|demo|seçdik|imtina|qərar verdik|uyğun gəlmir)/i;
const DEMO_RE = /\bdemo/i;
const DEMO_DONE_RE = /demo.{0,40}(keçirildi|göstərildi|təqdim edildi|baş tutdu)|(keçirdik|göstərdik).{0,20}demo/i;

export function whylostRules(
  ctx: CaseContext,
  loss: { agentReason: string; agentNote: string | null },
  openBlockers: Blocker[],
): ModuleOut {
  const all = ctxSources(ctx);
  const out: F[] = [];
  const missing: string[] = [];
  const custSents = sentencesOf(all, 'CUSTOMER');
  const lastCustomerSources = all.filter((s) => s.authorSide === 'CUSTOMER').slice(-2).map((s) => s.id);
  const stated = custSents.filter((s) => lastCustomerSources.includes(s.source.id) && STATED_REASON_RE.test(s.text)).slice(0, 2);
  for (const s of stated)
    out.push(
      finding({
        kind: 'CUSTOMER_STATED_REASON',
        title: `Müştərinin yazdığı: ${cut(s.text, 70)}`,
        explanation: 'Müştərinin son mesajlarında açıq yazılmış ifadə.',
        strength: 'MEDIUM',
        evidence: [{ sourceRef: s.source.id, quote: s.text }],
        en: { title: `Customer wrote: ${cut(s.text, 70)}`, explanation: "Stated explicitly in the customer's latest messages." },
      }),
    );
  if (stated.length === 0) missing.push('Müştərinin itki səbəbini açıq bildirdiyi mesaj tapılmadı.');

  const slow = computeReplyGaps(all).filter((g) => g.hours > 48);
  for (const g of slow.slice(0, 2)) {
    const qs = sentences(g.customerSource.content);
    const firstQ = qs.find((x) => x.text.endsWith('?')) ?? qs[0];
    out.push(
      finding({
        kind: 'POSSIBLE_FACTOR',
        title: `Gec cavab mümkün amildir (${Math.round(g.hours / 24)} gün)`,
        explanation: `Müştərinin ${g.customerSource.occurredAt.toISOString().slice(0, 10)} tarixli mesajına ${g.companySource ? `${g.companySource.occurredAt.toISOString().slice(0, 10)} tarixində` : 'heç vaxt'} cavab verilib. Bu, itkiyə təsir etmiş ola bilər, lakin səbəb olduğunu sübut etmir.`,
        epistemic: 'INFERRED',
        strength: g.hours > 120 ? 'MEDIUM' : 'WEAK',
        evidence: firstQ ? [{ sourceRef: g.customerSource.id, quote: firstQ.text }] : [],
        data: { agreesWithAgentReason: loss.agentReason === 'TIMING', replyHours: g.hours },
        en: {
          title: `Slow reply is a possible factor (${Math.round(g.hours / 24)} days)`,
          explanation: 'The company replied late to a customer message. It may have contributed, but this does not prove causation.',
        },
      }),
    );
  }

  const demoMentions = sentencesOf(all).filter((s) => DEMO_RE.test(s.text));
  const demoDone = all.some((s) => DEMO_DONE_RE.test(s.content));
  if (demoMentions.length > 0 && !demoDone) {
    const m = demoMentions[0]!;
    out.push(
      finding({
        kind: 'POSSIBLE_FACTOR',
        title: 'Demo müzakirə olunub, keçirildiyinə dair qeyd yoxdur',
        explanation: 'Mənbələrdə demo tələbi/vədi var, amma demonun keçirildiyini göstərən qeyd tapılmadı. Bu mümkün amildir.',
        epistemic: 'INFERRED',
        strength: 'MEDIUM',
        evidence: [{ sourceRef: m.source.id, quote: m.text }],
        data: { agreesWithAgentReason: false },
        en: {
          title: 'A demo was discussed but there is no record that it happened',
          explanation: 'The sources mention a demo request/promise, but no record shows it took place. This is a possible factor.',
        },
      }),
    );
  }

  for (const b of openBlockers.slice(0, 2))
    out.push(
      finding({
        kind: 'POSSIBLE_FACTOR',
        title: `Satış itirilərkən açıq maneə: ${cut(b.title, 60)}`,
        explanation: 'Bu maneə satış itiriləndə hələ açıq idi.',
        epistemic: 'INFERRED',
        strength: 'WEAK',
        evidence: b.sourceId && b.evidenceQuote ? [{ sourceRef: b.sourceId, quote: b.evidenceQuote }] : [],
        data: { agreesWithAgentReason: b.category === 'BUDGET' && loss.agentReason === 'PRICE' },
        en: { title: `Open blocker when the deal was lost: ${cut(b.title, 60)}`, explanation: 'This blocker was still open when the deal was lost.' },
      }),
    );

  if (loss.agentReason === 'PRICE' && !custSents.some((s) => /(qiymət|baha|büdcə)/i.test(s.text))) {
    out.push(
      finding({
        kind: 'MISSING_INFO',
        title: 'Qiymətin səbəb olduğunu təsdiqləyən müştəri ifadəsi yoxdur',
        explanation: 'Əməkdaş səbəb kimi "qiymət" seçib, lakin müştəri mesajlarında qiymət narazılığı tapılmadı.',
        epistemic: 'INFERRED',
        suggestedAction: 'Müştəridən qısa rəy istəyin və ya zəng qeydini əlavə edin.',
        en: {
          title: 'No customer statement confirms price as the reason',
          explanation: 'The employee selected "price", but no price complaint was found in customer messages.',
          suggestedAction: 'Ask the customer for brief feedback or add the call note.',
        },
      }),
    );
  }

  if (slow.length > 0)
    out.push(
      finding({
        kind: 'IMPROVEMENT',
        title: 'Müştəri mesajlarına cavab müddəti üçün xatırlatma qaydası',
        explanation: '48 saatdan uzun cavabsız qalan müştəri mesajları üçün məsul əməkdaşa xatırlatma yaradılması.',
        epistemic: 'INFERRED',
        strength: 'MEDIUM',
        data: { taskTitle: '48 saat cavabsız mesajlar üçün xatırlatma qaydası qurmaq' },
        en: {
          title: 'Reminder rule for customer reply time',
          explanation: 'Create a reminder for the owner when a customer message is unanswered for over 48 hours.',
        },
      }),
    );
  if (demoMentions.length > 0 && !demoDone)
    out.push(
      finding({
        kind: 'IMPROVEMENT',
        title: 'Demo tələblərini tapşırıq kimi qeyd etmək',
        explanation: 'Müştəri demo istədikdə avtomatik tapşırıq və son tarix yaradılması.',
        epistemic: 'INFERRED',
        strength: 'MEDIUM',
        data: { taskTitle: 'Demo tələbləri üçün məcburi tapşırıq və son tarix' },
        en: { title: 'Track demo requests as tasks', explanation: 'When a customer asks for a demo, create a task with a due date.' },
      }),
    );
  return { findings: out, missingInformation: missing };
}
