/**
 * Demo data (fictional, Azerbaijani). Everything is written through the same
 * services the app uses, and prepared results go through the normal evidence
 * verification pipeline (origin = DEMO_PREPARED), so every quote is real.
 */
import { prisma } from '../db.js';
import { hashPassword } from '../auth/session.js';
import { createSource } from '../modules/sources.js';
import { runModule, type EngineModule } from '../analysis/engine.js';
import { toJson } from '../lib/json.js';
import { audit } from '../lib/audit.js';
import type { HandoverPackage } from '../analysis/schemas.js';

const SYSTEM = { type: 'SYSTEM' as const, name: 'demo seed' };
export const DEMO_PASSWORD = 'admin1234';
const day = 864e5;
const at = (iso: string) => new Date(iso);

type Ev = { sourceRef: string; quote: string; label?: string };
interface PF {
  kind: string;
  title: string;
  explanation: string;
  epistemic: 'OBSERVED' | 'INFERRED';
  strength: 'STRONG' | 'MEDIUM' | 'WEAK';
  suggestedAction?: string;
  evidence?: Ev[];
  data?: Record<string, unknown>;
  en: { title: string; explanation: string; suggestedAction?: string };
}
const prepared = (findings: PF[], missingInformation: string[] = []) => ({ findings, missingInformation });

async function wipe() {
  // Cascades remove cases, sources, findings, tasks, etc.
  await prisma.auditEvent.deleteMany();
  await prisma.task.deleteMany();
  await prisma.customer.deleteMany();
  // Accounts from earlier seed versions.
  await prisma.user.deleteMany({ where: { email: { in: ['admin@mindrift.az', 'aysel@mindrift.az', 'murad@mindrift.az', 'nigar@mindrift.az', 'resad@bakiretail.az'] } } });
}

export async function seedDemo() {
  await wipe();
  const pw = await hashPassword(DEMO_PASSWORD);
  const upsertUser = (email: string, name: string, role: string) =>
    prisma.user.upsert({ where: { email }, create: { email, name, role, passwordHash: pw }, update: { name, role, passwordHash: pw } });
  const admin = await upsertUser('elcan@mindrift.az', 'Elcan Məmmədov', 'ADMIN');
  const nihat = await upsertUser('nihat@mindrift.az', 'Nihat Zəkiyev', 'AGENT');
  const ataxan = await upsertUser('ataxan@mindrift.az', 'Ataxan Hacızadə', 'AGENT');

  // ======================================================== 1. Bakı Retail
  const bakuRetail = await prisma.customer.create({
    data: {
      name: 'Bakı Retail',
      industry: 'Pərakəndə ticarət',
      contactName: 'Rəşad Məmmədov',
      contactEmail: 'resad@bakiretail.az',
      phone: '+994 50 000 00 01',
      status: 'ACTIVE',
      notes: 'İki filial, gündə 40-60 sifariş. Sifarişlərin əsas hissəsi WhatsApp-dan gəlir.',
    },
  });

  // --- Earlier case (2025): same underlying problem, "solved" with an Excel template.
  const brOld = await prisma.customerCase.create({
    data: {
      customerId: bakuRetail.id,
      title: 'WhatsApp sifarişlərinin qeydiyyatı',
      initialRequest: 'WhatsApp-dan gələn sifarişlər itir, menecerlər sifarişləri unudur.',
      coreNeed: 'Sifarişlərin bir yerdə qeydə alınması',
      status: 'CLOSED',
      salesOutcome: 'WON',
      ownerId: ataxan.id,
      closedAt: at('2025-11-20T10:00:00Z'),
      closeReason: 'Excel sifariş şablonu hazırlandı və menecerlərə təlim keçildi.',
      createdAt: at('2025-11-03T09:00:00Z'),
    },
  });
  await createSource(brOld.id, {
    type: 'WHATSAPP', origin: 'DEMO_IMPORT', title: 'WhatsApp: sifarişlər itir', author: 'Rəşad Məmmədov', authorSide: 'CUSTOMER',
    occurredAt: at('2025-11-03T09:00:00Z'),
    content: 'Salam. WhatsApp-a gələn sifarişlər itir, menecerlər bəzi sifarişləri unudur. Bunu necə qaydaya sala bilərik?',
  }, SYSTEM);
  await createSource(brOld.id, {
    type: 'SUPPORT_REPLY', title: 'Həll: Excel şablonu', author: 'Ataxan Hacızadə', authorSide: 'COMPANY',
    occurredAt: at('2025-11-18T14:00:00Z'),
    content: 'Sizin üçün Excel sifariş şablonu hazırladıq və menecerlərə 1 saatlıq təlim keçdik. Hər WhatsApp sifarişi şablona əl ilə yazılmalıdır.',
  }, SYSTEM);

  // --- Main scenario case.
  const brMain = await prisma.customerCase.create({
    data: {
      customerId: bakuRetail.id,
      title: 'Onlayn mağaza saytı',
      initialRequest: 'Müştəri sayt istəyir.',
      status: 'IN_PROGRESS',
      salesOutcome: 'WON',
      ownerId: nihat.id,
      createdAt: at('2026-08-04T09:00:00Z'),
    },
  });
  await createSource(brMain.id, {
    type: 'WHATSAPP', origin: 'DEMO_IMPORT', title: 'WhatsApp: ilk müraciət', author: 'Rəşad Məmmədov', authorSide: 'CUSTOMER',
    occurredAt: at('2026-08-04T09:12:00Z'),
    content:
      'Salam. Bizə sayt lazımdır. Əsas problemimiz odur ki, sifarişlər WhatsApp-da itir, menecerlər hər gün 5-10 sifarişi unudur. Müştərilər zəng edib şikayət edir. Sentyabrın 15-nə qədər işləyən sistem istəyirik. Büdcəmiz təxminən 3000 AZN-dir.',
  }, SYSTEM);
  await createSource(brMain.id, {
    type: 'CALL_NOTE', title: 'Zəng qeydi: ehtiyacın dəqiqləşdirilməsi', author: 'Nihat Zəkiyev', authorSide: 'COMPANY',
    occurredAt: at('2026-08-05T11:00:00Z'),
    content:
      'Rəşad bəylə 20 dəqiqəlik zəng. Hazırda 2 filial var, gündə 40-60 sifariş gəlir. Sifarişlər WhatsApp-dan Excel cədvəlinə əl ilə köçürülür, bəziləri yazılmır. Müştəri saytı "sifarişlərin bir yerdə görünməsi" üçün istəyir.',
  }, SYSTEM);
  const m3 = await createSource(brMain.id, {
    type: 'EMAIL', origin: 'DEMO_IMPORT', title: 'E-poçt: zəngdən sonra', author: 'Nihat Zəkiyev', authorSide: 'COMPANY',
    occurredAt: at('2026-08-06T10:30:00Z'), packageRef: 'Biznes',
    content:
      'Hörmətli Rəşad bəy, zəng üçün təşəkkür edirik. Təklifimizi bu həftə göndərəcəyik. Qeyd edim ki, WhatsApp inteqrasiyası pulsuz olacaq və Biznes paketinə daxildir. Neçə məhsul kateqoriyanız var?',
  }, SYSTEM);
  const m4 = await createSource(brMain.id, {
    type: 'EMAIL', origin: 'DEMO_IMPORT', title: 'E-poçt: kateqoriyalar və suallar', author: 'Rəşad Məmmədov', authorSide: 'CUSTOMER',
    occurredAt: at('2026-08-07T16:45:00Z'),
    content:
      'Təxminən 12 kateqoriya və 800 məhsulumuz var. Köhnə Excel bazasındakı məhsul və müştəri məlumatlarını yeni sistemə siz köçürəcəksiniz, yoxsa biz özümüz etməliyik? Bir də, ödəniş kartla olacaqmı?',
  }, SYSTEM);
  const m5 = await createSource(brMain.id, {
    type: 'PROPOSAL', title: 'Kommersiya təklifi — Biznes paketi', author: 'Nihat Zəkiyev', authorSide: 'COMPANY',
    occurredAt: at('2026-08-09T12:00:00Z'), packageRef: 'Biznes',
    content:
      'Kommersiya təklifi — Biznes paketi\n\n1. Korporativ sayt (10 səhifə, məhsul kataloqu) — 2200 AZN\n2. Onlayn kart ödənişi modulu — 400 AZN\n3. WhatsApp inteqrasiyası — 150 AZN\n4. Bloq bölməsi — 250 AZN\n5. 3 ay texniki dəstək — paketə daxildir\n\nTəhvil müddəti: 30 iş günü.\nTəklif 30 gün qüvvədədir.',
  }, SYSTEM);
  const m6 = await createSource(brMain.id, {
    type: 'EMAIL', origin: 'DEMO_IMPORT', title: 'E-poçt: təklifə cavab', author: 'Rəşad Məmmədov', authorSide: 'CUSTOMER',
    occurredAt: at('2026-08-12T09:20:00Z'),
    content:
      'Təklifi aldıq, ümumilikdə uyğundur. Amma sizdə WhatsApp inteqrasiyası pulsuz yazılmışdı, təklifdə isə 150 AZN görürük. Excel məlumatlarının köçürülməsi ilə bağlı sualımız da hələ cavabsızdır.',
  }, SYSTEM);
  await createSource(brMain.id, {
    type: 'SUPPORT_REPLY', title: 'Sayt işə salındı', author: 'Nihat Zəkiyev', authorSide: 'COMPANY',
    occurredAt: at('2026-09-18T15:00:00Z'),
    content: 'Rəşad bəy, sayt hazırdır və işə salındı. Məhsul kataloqu və kart ödənişi işləyir. Sayt ünvanı: bakiretail.az. Təşəkkür edirik!',
  }, SYSTEM);
  await createSource(brMain.id, {
    type: 'WHATSAPP', origin: 'DEMO_IMPORT', title: 'WhatsApp: işə salındıqdan sonra', author: 'Rəşad Məmmədov', authorSide: 'CUSTOMER',
    occurredAt: at('2026-09-22T10:05:00Z'),
    content:
      'Sayt gözəl alınıb, təşəkkürlər. Amma sifarişlər yenə əsasən WhatsApp-a gəlir və orada itir. Saytdakı sifarişlər isə ayrıca e-poçta düşür, menecerlər iki yerə baxmalı olur.',
  }, SYSTEM);
  await createSource(brMain.id, {
    type: 'INTERNAL_NOTE', title: 'Daxili qeyd: təhvil', author: 'Nihat Zəkiyev', authorSide: 'COMPANY',
    occurredAt: at('2026-09-25T09:00:00Z'),
    content: 'Mən 2 həftəlik məzuniyyətə çıxıram. İş Ataxan Hacızadəyə ötürülür. Müştəri ilə son razılaşma: Biznes paketi, 3 ay pulsuz dəstək.',
  }, SYSTEM);

  await prisma.commitment.createMany({
    data: [
      { caseId: brMain.id, text: '3 ay texniki dəstək paketə daxildir', sourceId: m5.id },
      { caseId: brMain.id, text: 'Təhvil müddəti: 30 iş günü', sourceId: m5.id },
      { caseId: brMain.id, text: 'WhatsApp inteqrasiyası "pulsuz" deyilib — təkliflə ziddiyyət təşkil edir', sourceId: m3.id, status: 'DISPUTED' },
    ],
  });
  await prisma.blocker.create({
    data: {
      caseId: brMain.id, category: 'UNCLEAR_TERMS', title: 'WhatsApp inteqrasiyasının qiyməti dəqiqləşdirilməyib',
      description: 'Müştəriyə pulsuz deyilib, təklifdə 150 AZN yazılıb.', ownerId: nihat.id,
      nextStep: 'Rəhbərliklə qiyməti razılaşdırıb müştəriyə yazılı cavab vermək', dueDate: new Date(Date.now() + 2 * day),
      resolutionCriteria: 'Müştəri yekun qiyməti yazılı şəkildə təsdiqləyir', status: 'WAITING_CUSTOMER',
      sourceId: m6.id, evidenceQuote: 'sizdə WhatsApp inteqrasiyası pulsuz yazılmışdı, təklifdə isə 150 AZN görürük',
    },
  });
  await prisma.task.createMany({
    data: [
      { caseId: brMain.id, title: 'Sifariş paneli üçün texniki qiymətləndirmə hazırlamaq', assigneeId: nihat.id, dueDate: new Date(Date.now() - 2 * day), status: 'TODO' },
      { caseId: brMain.id, title: 'Müştəriyə WhatsApp inteqrasiyasının yekun qiymətini yazmaq', assigneeId: nihat.id, dueDate: new Date(Date.now() + 1 * day), status: 'IN_PROGRESS' },
    ],
  });
  await prisma.resolutionCriterion.createMany({
    data: [
      { caseId: brMain.id, description: 'Sayt istifadəyə verilib, kataloq və kart ödənişi işləyir', evidenceRequired: 'İşə salınma bildirişi və saytın işlək linki', status: 'MET', evidenceNote: 'Sayt bakiretail.az ünvanında işləyir (18.09.2026).' },
      { caseId: brMain.id, description: 'WhatsApp və saytdan gələn sifarişlər bir paneldə qeydə alınır', evidenceRequired: 'Panelin ekran görüntüsü və test sifarişləri', status: 'NOT_MET', evidenceNote: 'Müştəri iki ayrı yerə baxıldığını yazıb (22.09.2026).' },
      { caseId: brMain.id, description: 'Bir həftə ərzində itən sifariş olmur', evidenceRequired: 'Müştərinin təsdiqi', requiresCustomerConfirmation: true },
    ],
  });

  // The repeat case exists before the main case is analysed, so the main case's
  // "repeat problems" input does not change after seeding.
  const brRepeat = await prisma.customerCase.create({
    data: {
      customerId: bakuRetail.id,
      title: 'Sifarişlər yenə itir',
      initialRequest: 'Müştəri bu həftə 7 sifarişin itdiyini bildirir.',
      status: 'NEW',
      salesOutcome: 'NOT_APPLICABLE',
      ownerId: ataxan.id,
      createdAt: at('2026-10-03T08:40:00Z'),
    },
  });
  await createSource(brRepeat.id, {
    type: 'WHATSAPP', origin: 'DEMO_IMPORT', title: 'WhatsApp: yeni şikayət', author: 'Rəşad Məmmədov', authorSide: 'CUSTOMER',
    occurredAt: at('2026-10-03T08:40:00Z'),
    content:
      'Salam, yenə eyni problem: bu həftə 7 sifariş itdi. Müştərilər WhatsApp-a yazır, saytdakı sifarişlərlə qarışır. Sayt bunu həll etməli idi.',
  }, SYSTEM);

  const S = (n: number) => `S${n}`;
  await runModule(brMain.id, 'BRIDGE', SYSTEM, {
    prepared: prepared([
      {
        kind: 'EXPLICIT_REQUEST', epistemic: 'OBSERVED', strength: 'STRONG',
        title: 'Müştəri sayt istəyir',
        explanation: 'İlk mesajda birbaşa sayt tələb olunur.',
        evidence: [{ sourceRef: S(1), quote: 'Bizə sayt lazımdır.' }],
        en: { title: 'The customer asks for a website', explanation: 'The first message asks directly for a website.' },
      },
      {
        kind: 'CORE_PROBLEM', epistemic: 'OBSERVED', strength: 'STRONG',
        title: 'Əsas problem: WhatsApp sifarişlərinin itməsi',
        explanation: 'Müştəri əsas problemi açıq yazıb: sifarişlər WhatsApp-da itir və menecerlər onları unudur. Sayt bu problemin həlli üçün vasitə kimi istənilir.',
        evidence: [
          { sourceRef: S(1), quote: 'Əsas problemimiz odur ki, sifarişlər WhatsApp-da itir, menecerlər hər gün 5-10 sifarişi unudur.' },
          { sourceRef: S(2), quote: 'Sifarişlər WhatsApp-dan Excel cədvəlinə əl ilə köçürülür, bəziləri yazılmır.' },
        ],
        suggestedAction: 'İşin "əsas ehtiyac" sahəsinə "Sifarişlərin itməməsi və bir yerdə idarə olunması" yazın.',
        en: {
          title: 'Core problem: orders getting lost in WhatsApp',
          explanation: 'The customer explicitly states the core problem: orders get lost in WhatsApp and managers forget them. The website is requested as a means to solve it.',
          suggestedAction: 'Record "orders are not lost and are managed in one place" as the core need.',
        },
      },
      {
        kind: 'SUCCESS_CRITERION', epistemic: 'INFERRED', strength: 'MEDIUM',
        title: 'Uğur meyarı: sifarişlər bir yerdə görünür və itmir',
        explanation: 'Zəng qeydində müştərinin məqsədi "sifarişlərin bir yerdə görünməsi" kimi qeyd edilib. Ölçülə bilən meyar (məs. itən sifariş sayı) müştəri ilə razılaşdırılmayıb.',
        evidence: [{ sourceRef: S(2), quote: 'Müştəri saytı "sifarişlərin bir yerdə görünməsi" üçün istəyir.' }],
        en: {
          title: 'Success criterion: all orders visible in one place and none lost',
          explanation: 'The call note records the goal as "orders visible in one place". A measurable criterion has not been agreed with the customer.',
        },
      },
      {
        kind: 'CONSTRAINT', epistemic: 'OBSERVED', strength: 'STRONG', data: { constraintType: 'TIME' },
        title: 'Vaxt: 15 sentyabra qədər işləyən sistem',
        explanation: 'Müştəri son tarix bildirib. Təklifdəki 30 iş günü 9 avqustdan hesablansa, bu tarixə çatmır.',
        evidence: [
          { sourceRef: S(1), quote: 'Sentyabrın 15-nə qədər işləyən sistem istəyirik.' },
          { sourceRef: S(5), quote: 'Təhvil müddəti: 30 iş günü.' },
        ],
        en: { title: 'Time: a working system by 15 September', explanation: 'The customer set a deadline. 30 working days from 9 August does not meet it.' },
      },
      {
        kind: 'CONSTRAINT', epistemic: 'OBSERVED', strength: 'STRONG', data: { constraintType: 'BUDGET' },
        title: 'Büdcə: təxminən 3000 AZN',
        explanation: 'Təklifin cəmi (3000 AZN) büdcənin yuxarı həddindədir; ehtiyac olmayan hissələr çıxarılsa, sifariş paneli üçün yer açıla bilər.',
        evidence: [{ sourceRef: S(1), quote: 'Büdcəmiz təxminən 3000 AZN-dir.' }],
        en: { title: 'Budget: about 3000 AZN', explanation: 'The proposal total (3000 AZN) is at the top of the budget; removing unneeded parts could make room for an order panel.' },
      },
      {
        kind: 'MATCH', epistemic: 'OBSERVED', strength: 'MEDIUM', data: { needTitle: 'Sayt' },
        title: 'Uyğun: kataloqlu sayt və kart ödənişi',
        explanation: 'Təklif açıq istənilən saytı və müştərinin soruşduğu kart ödənişini əhatə edir.',
        evidence: [
          { sourceRef: S(5), quote: 'Korporativ sayt (10 səhifə, məhsul kataloqu) — 2200 AZN' },
          { sourceRef: S(4), quote: 'Bir də, ödəniş kartla olacaqmı?' },
        ],
        en: { title: 'Match: catalogue website and card payment', explanation: 'The proposal covers the requested website and the card payment the customer asked about.' },
      },
      {
        kind: 'GAP', epistemic: 'INFERRED', strength: 'STRONG',
        title: 'Boşluq: təklifdə sifariş qeydiyyatı/idarəetməsi yoxdur',
        explanation: 'Müştərinin əsas problemi itən WhatsApp sifarişləridir, amma təklifdə sifarişləri bir yerdə qeydə alan və izləyən heç bir hissə yoxdur. WhatsApp inteqrasiyasının nə etdiyi (sifarişi qeydə alırmı) təsvir edilməyib.',
        evidence: [
          { sourceRef: S(1), quote: 'sifarişlər WhatsApp-da itir' },
          { sourceRef: S(5), quote: 'WhatsApp inteqrasiyası — 150 AZN' },
        ],
        suggestedAction: 'Təklifə WhatsApp və sayt sifarişlərini bir paneldə toplayan sifariş idarəetmə modulu əlavə etməyi müzakirə edin.',
        en: {
          title: 'Gap: the proposal has no order registration / management',
          explanation: "The customer's core problem is lost WhatsApp orders, but nothing in the proposal records and tracks orders in one place. What the WhatsApp integration actually does is not described.",
          suggestedAction: 'Discuss adding an order-management module that collects WhatsApp and website orders in one panel.',
        },
      },
      {
        kind: 'NOT_NEEDED', epistemic: 'INFERRED', strength: 'MEDIUM',
        title: 'Ehtiyaca xidmət etməyən: bloq bölməsi',
        explanation: 'Müştərinin heç bir mesajında bloq və ya məzmun marketinqi ehtiyacı yoxdur.',
        evidence: [{ sourceRef: S(5), quote: 'Bloq bölməsi — 250 AZN' }],
        suggestedAction: 'Bloqu çıxarıb büdcəni sifariş idarəetməsinə yönləndirməyi təklif edin.',
        en: { title: 'Not serving a need: blog section', explanation: 'No customer message mentions a need for a blog or content marketing.', suggestedAction: 'Offer to drop the blog and move budget to order management.' },
      },
      {
        kind: 'QUESTION_TO_ASK', epistemic: 'INFERRED', strength: 'MEDIUM',
        title: 'Sifarişlər hansı mərhələlərdən keçir və kim izləyir?',
        explanation: 'Sifariş idarəetməsini düzgün təklif etmək üçün iş axını (qəbul, təsdiq, çatdırılma) və məsul şəxslər məlum deyil.',
        en: { title: 'Which stages do orders go through and who tracks them?', explanation: 'The order workflow (intake, confirmation, delivery) and responsible people are unknown.' },
      },
      {
        kind: 'QUESTION_TO_ASK', epistemic: 'INFERRED', strength: 'MEDIUM',
        title: '15 sentyabr tarixi dəyişməzdirmi, yoxsa mərhələli təhvil mümkündür?',
        explanation: 'Təklifin təhvil müddəti müştərinin tarixinə uyğun gəlmir.',
        evidence: [{ sourceRef: S(1), quote: 'Sentyabrın 15-nə qədər işləyən sistem istəyirik.' }],
        en: { title: 'Is 15 September fixed, or is a phased delivery possible?', explanation: "The proposal's delivery time does not fit the customer's date." },
      },
    ], ['Müştərinin hazırkı WhatsApp istifadə qaydası (bir nömrə, yoxsa hər menecerin öz nömrəsi) məlum deyil.']),
  });
  await runModule(brMain.id, 'ONEVOICE', SYSTEM, {
    prepared: prepared([
      {
        kind: 'CONTRADICTION', epistemic: 'OBSERVED', strength: 'STRONG',
        title: 'WhatsApp inteqrasiyası: "pulsuz" və "150 AZN"',
        explanation: 'Satış e-poçtunda inteqrasiyanın pulsuz və Biznes paketinə daxil olduğu yazılıb, eyni paket üçün kommersiya təklifində 150 AZN göstərilib. Sonradan endirim və ya dəyişiklik barədə razılaşma yoxdur; müştəri fərqi özü qeyd edib.',
        evidence: [
          { sourceRef: S(3), quote: 'WhatsApp inteqrasiyası pulsuz olacaq və Biznes paketinə daxildir', label: 'A' },
          { sourceRef: S(5), quote: 'WhatsApp inteqrasiyası — 150 AZN', label: 'B' },
          { sourceRef: S(6), quote: 'sizdə WhatsApp inteqrasiyası pulsuz yazılmışdı, təklifdə isə 150 AZN görürük' },
        ],
        suggestedAction: 'Hansı şərtin keçərli olduğuna rəhbərlik qərar versin; müştəriyə yazılı cavab verin və təklifi uyğunlaşdırın. AI şərti dəyişmir.',
        data: { topic: 'PRICE', impact: 'Müştəri vədə etibarını itirə bilər; hesab-faktura zamanı mübahisə yarana bilər.', effectiveStatus: 'CONFLICT', resolvedByLaterAgreement: false },
        en: {
          title: 'WhatsApp integration: "free" vs "150 AZN"',
          explanation: 'The sales e-mail says the integration is free and included in the Business package; the proposal for the same package lists 150 AZN. There is no later agreed change; the customer noticed it.',
          suggestedAction: 'Management decides which term applies; reply to the customer in writing and align the proposal. The AI does not change terms.',
        },
      },
      {
        kind: 'NEEDS_CLARIFICATION', epistemic: 'INFERRED', strength: 'WEAK',
        title: 'Dəstək müddəti: "3 ay" — pulsuz olub-olmadığı dəqiq deyil',
        explanation: 'Təklifdə 3 ay dəstək paketə daxil kimi göstərilib, daxili qeyddə isə "3 ay pulsuz dəstək" yazılıb. Bunlar uyğun ola bilər, amma 3 aydan sonrakı şərtlər heç yerdə yoxdur.',
        evidence: [
          { sourceRef: S(5), quote: '3 ay texniki dəstək — paketə daxildir', label: 'A' },
          { sourceRef: S(9), quote: 'Biznes paketi, 3 ay pulsuz dəstək', label: 'B' },
        ],
        suggestedAction: '3 aydan sonra dəstəyin qiymətini və şərtlərini müqavilədə dəqiqləşdirin.',
        data: { topic: 'SUPPORT_PERIOD', impact: 'Dəstək bitəndə gözlənilməz ödəniş tələbi yarana bilər.', effectiveStatus: 'UNKNOWN_WHICH_APPLIES', resolvedByLaterAgreement: false },
        en: {
          title: 'Support: "3 months" — terms after that are unclear',
          explanation: 'The proposal includes 3 months of support and the internal note says "3 months free support". These may agree, but terms after 3 months are not written anywhere.',
          suggestedAction: 'Clarify the price and terms of support after 3 months in the contract.',
        },
      },
    ]),
  });
  await runModule(brMain.id, 'UNBLOCK', SYSTEM, {
    prepared: prepared([
      {
        kind: 'BLOCKER', epistemic: 'OBSERVED', strength: 'STRONG',
        title: 'Cavabsız sual: Excel məlumatlarını kim köçürəcək?',
        explanation: 'Müştəri məlumat köçürülməsini 7 avqustda soruşub, 12 avqustda sualın hələ cavabsız olduğunu yazıb. Sonrakı şirkət mesajlarında cavab yoxdur.',
        evidence: [
          { sourceRef: S(4), quote: 'Köhnə Excel bazasındakı məhsul və müştəri məlumatlarını yeni sistemə siz köçürəcəksiniz, yoxsa biz özümüz etməliyik?' },
          { sourceRef: S(6), quote: 'Excel məlumatlarının köçürülməsi ilə bağlı sualımız da hələ cavabsızdır.' },
        ],
        suggestedAction: 'Köçürmənin əhatəsini və qiymətini müəyyən edib müştəriyə yazılı cavab verin.',
        data: {
          category: 'DATA_MIGRATION', nextStep: '800 məhsul və müştəri bazasının köçürülməsi üçün həcm və qiymət təklifi göndərmək',
          resolutionCriteria: 'Müştəri köçürmənin kim tərəfindən və nə vaxt ediləcəyini yazılı təsdiqləyir', suggestedDueDays: 2,
          en: { nextStep: 'Send scope and price for migrating 800 products and the customer base', resolutionCriteria: 'Customer confirms in writing who migrates the data and when' },
        },
        en: {
          title: 'Unanswered question: who migrates the Excel data?',
          explanation: 'The customer asked about data migration on 7 August and wrote on 12 August that it is still unanswered. No later company message answers it.',
          suggestedAction: 'Define the migration scope and price and answer the customer in writing.',
        },
      },
    ]),
  });
  await runModule(brMain.id, 'LOOP', SYSTEM, {
    prepared: prepared([
      {
        kind: 'REPEAT_CANDIDATE', epistemic: 'INFERRED', strength: 'MEDIUM',
        title: 'Eyni problem 2025-ci ildə də qeydə alınıb',
        explanation: 'Noyabr 2025-də müştəri eyni problemlə (WhatsApp sifarişlərinin itməsi) müraciət edib; həll Excel şablonu olub. İndiki müraciət eyni əsas problemə işarə edir.',
        evidence: [
          { sourceRef: S(1), quote: 'sifarişlər WhatsApp-da itir, menecerlər hər gün 5-10 sifarişi unudur' },
          { sourceRef: 'P1', quote: 'WhatsApp-a gələn sifarişlər itir, menecerlər bəzi sifarişləri unudur.' },
        ],
        suggestedAction: 'Əvvəlki həllin (Excel şablonu) niyə davamlı olmadığını öyrənin.',
        data: { relatedCaseRef: 'C1', previousSolution: 'Excel sifariş şablonu və menecerlərə təlim', rootCauseSuggestion: 'Sifarişlər əl ilə köçürüldüyü üçün itir; avtomatik qeydiyyat olmadan problem təkrarlanacaq.', certainty: 'LIKELY' },
        en: {
          title: 'The same problem was recorded in 2025',
          explanation: 'In November 2025 the customer reported the same problem (lost WhatsApp orders); the fix was an Excel template. The current request points to the same root problem.',
          suggestedAction: 'Find out why the previous fix (Excel template) did not last.',
        },
      },
    ]),
  });
  await runModule(brMain.id, 'PROOFCLOSE', SYSTEM, {
    prepared: prepared([
      {
        kind: 'VERDICT', epistemic: 'OBSERVED', strength: 'STRONG',
        title: 'Həll edilməmiş məsələ qalır',
        explanation: 'Sayt işə salınıb (K1 yerinə yetirilib), amma müştəri sifarişlərin yenə WhatsApp-da itdiyini və iki ayrı yerə baxıldığını yazır. "Əməkdaş cavab verdi" — bəli; "müştərinin problemi həll olundu" — xeyr.',
        evidence: [
          { sourceRef: S(7), quote: 'sayt hazırdır və işə salındı' },
          { sourceRef: S(8), quote: 'Amma sifarişlər yenə əsasən WhatsApp-a gəlir və orada itir.' },
        ],
        data: { verdict: 'UNRESOLVED', criteria: [
          { criterionRef: 'K1', status: 'MET', note: 'Sayt işləyir.' },
          { criterionRef: 'K2', status: 'NOT_MET', note: 'Sifarişlər iki ayrı yerdədir.' },
          { criterionRef: 'K3', status: 'PENDING', note: 'Müştəri təsdiqi yoxdur.' },
        ] },
        en: {
          title: 'An unresolved issue remains',
          explanation: 'The website is live (K1 met), but the customer writes that orders are still lost in WhatsApp and managers check two places. "Employee replied" — yes; "customer problem solved" — no.',
        },
      },
    ]),
  });
  await prisma.customerCase.update({ where: { id: brMain.id }, data: { analyzedRevision: (await prisma.customerCase.findUniqueOrThrow({ where: { id: brMain.id } })).sourcesRevision } });

  const handoverPkg: HandoverPackage = {
    customerGoal: 'Sifarişlərin (xüsusilə WhatsApp sifarişlərinin) itməməsi və bir yerdə idarə olunması. Sayt bu məqsəd üçün vasitədir.',
    currentState: 'Sayt 18.09.2026-da işə salınıb. Müştəri sifarişlərin yenə itdiyini bildirib; həll təsdiqlənməyib. WhatsApp inteqrasiyasının qiyməti üzrə ziddiyyət açıqdır.',
    agreements: ['Biznes paketi', '3 ay texniki dəstək paketə daxildir', 'Təhvil müddəti: 30 iş günü'],
    openBlockers: ['[UNCLEAR_TERMS] WhatsApp inteqrasiyasının qiyməti dəqiqləşdirilməyib — müştəridən cavab gözlənilir', 'Excel məlumatlarının köçürülməsi sualı cavabsızdır (AI təklifi, hələ maneə kimi qəbul edilməyib)'],
    contradictions: ['WhatsApp inteqrasiyası: "pulsuz" (06.08 e-poçt) və "150 AZN" (09.08 təklif)'],
    collectedInfo: ['2 filial, gündə 40-60 sifariş', '12 kateqoriya, 800 məhsul', 'Büdcə ~3000 AZN', 'Kart ödənişi tələb olunur'],
    doNotAsk: [
      { question: 'Neçə məhsul kateqoriyanız var?', answer: 'Təxminən 12 kateqoriya və 800 məhsulumuz var.', sourceId: m4.id, quote: 'Təxminən 12 kateqoriya və 800 məhsulumuz var.' },
      { question: 'Ödəniş kartla olacaqmı? (müştəri soruşub, təklifdə var)', answer: 'Onlayn kart ödənişi modulu təklifə daxildir.', sourceId: m5.id, quote: 'Onlayn kart ödənişi modulu — 400 AZN' },
    ],
    nextSteps: [
      { text: 'Müştəriyə WhatsApp inteqrasiyasının yekun qiymətini yazmaq', dueDate: new Date(Date.now() + day).toISOString().slice(0, 10) },
      { text: 'Sifariş paneli üçün texniki qiymətləndirmə hazırlamaq' },
      { text: 'Köçürmə sualına yazılı cavab vermək' },
    ],
    notes: ['Demo üçün hazırlanmış təhvil paketi (real model analizi deyil).'],
  };
  await prisma.handover.create({
    data: { caseId: brMain.id, fromUserId: nihat.id, toUserId: ataxan.id, packageJson: toJson(handoverPkg), origin: 'DEMO_PREPARED', status: 'PENDING', createdAt: at('2026-09-25T09:30:00Z') },
  });
  await audit({ type: 'USER', id: nihat.id, name: nihat.name }, 'HANDOVER_CREATED', { caseId: brMain.id, details: { to: ataxan.id } });

  // --- Repeat (created earlier in this function): customer comes back with the same problem.
  await runModule(brRepeat.id, 'LOOP', SYSTEM, {
    prepared: prepared([
      {
        kind: 'REPEAT_CANDIDATE', epistemic: 'OBSERVED', strength: 'STRONG',
        title: 'Təkrar problem: "Onlayn mağaza saytı" işi',
        explanation: 'Müştəri birbaşa "yenə eyni problem" yazır. Əvvəlki işdə sayt təhvil verilib, amma sifarişlərin itməsi həll olunmayıb (həll təsdiqi: həll edilməmiş məsələ qalır).',
        evidence: [
          { sourceRef: 'S1', quote: 'yenə eyni problem: bu həftə 7 sifariş itdi' },
          { sourceRef: 'P10', quote: 'Amma sifarişlər yenə əsasən WhatsApp-a gəlir və orada itir.' },
        ],
        suggestedAction: 'İşləri əlaqələndirin və sifariş idarəetməsi üçün əsas səbəb tapşırığı yaradın.',
        data: { relatedCaseRef: 'C2', previousSolution: 'Sayt hazırlanıb (kataloq, kart ödənişi); sifariş qeydiyyatı təklifə daxil olmayıb.', rootCauseSuggestion: 'WhatsApp və sayt sifarişləri vahid paneldə toplanmır.', certainty: 'LIKELY' },
        en: {
          title: 'Repeat problem: the "Online store website" case',
          explanation: 'The customer literally writes "the same problem again". In the earlier case the website was delivered but lost orders were not solved (resolution check: unresolved).',
          suggestedAction: 'Link the cases and create a root-cause task for order management.',
        },
      },
      {
        kind: 'REPEAT_CANDIDATE', epistemic: 'INFERRED', strength: 'MEDIUM',
        title: 'Təkrar problem: 2025 "WhatsApp sifarişlərinin qeydiyyatı"',
        explanation: 'Eyni problem 2025-ci ildə də olub və Excel şablonu ilə "həll edilib". Bu, problemin üçüncü dəfə qeydə alınmasıdır.',
        evidence: [
          { sourceRef: 'S1', quote: 'Müştərilər WhatsApp-a yazır, saytdakı sifarişlərlə qarışır.' },
          { sourceRef: 'P1', quote: 'WhatsApp-a gələn sifarişlər itir' },
        ],
        data: { relatedCaseRef: 'C1', previousSolution: 'Excel sifariş şablonu və təlim', rootCauseSuggestion: 'Əl ilə köçürmə qalır.', certainty: 'LIKELY' },
        en: {
          title: 'Repeat problem: 2025 "WhatsApp order registration"',
          explanation: 'The same problem occurred in 2025 and was "solved" with an Excel template. This is the third occurrence.',
        },
      },
    ]),
  });

  // ======================================================== 2. Gəncə Mebel — lost deal (WhyLost)
  const gence = await prisma.customer.create({
    data: { name: 'Gəncə Mebel', industry: 'Mebel istehsalı', contactName: 'Elşən Babayev', contactEmail: 'elshen@gencemebel.az', status: 'PROSPECT' },
  });
  const gCase = await prisma.customerCase.create({
    data: {
      customerId: gence.id, title: 'Satış komandası üçün CRM', initialRequest: '15 istifadəçilik CRM və canlı demo istəyi.',
      status: 'CLOSED', salesOutcome: 'LOST', ownerId: nihat.id, closedAt: at('2026-07-24T10:00:00Z'), closeReason: 'Satış itirildi.',
      closedManually: true, createdAt: at('2026-07-01T09:00:00Z'),
    },
  });
  await createSource(gCase.id, {
    type: 'EMAIL', origin: 'DEMO_IMPORT', title: 'E-poçt: CRM sorğusu', author: 'Elşən Babayev', authorSide: 'CUSTOMER', occurredAt: at('2026-07-01T09:00:00Z'),
    content: 'Salam, satış komandamız üçün CRM axtarırıq, 15 istifadəçi olacaq. Qərar verməzdən əvvəl canlı demo görmək istəyirik. Qiymət təklifinizi də göndərin.',
  }, SYSTEM);
  await createSource(gCase.id, {
    type: 'EMAIL', origin: 'DEMO_IMPORT', title: 'E-poçt: təklif', author: 'Nihat Zəkiyev', authorSide: 'COMPANY', occurredAt: at('2026-07-03T10:00:00Z'), packageRef: 'Standart',
    content: 'Təşəkkürlər! Təklifi əlavə edirik: Standart paket, 15 istifadəçi — ayda 450 AZN. Demonu gələn həftə təşkil edəcəyik, tarix barədə yazacağam.',
  }, SYSTEM);
  await createSource(gCase.id, {
    type: 'PROPOSAL', title: 'Təklif: Standart paket', author: 'Nihat Zəkiyev', authorSide: 'COMPANY', occurredAt: at('2026-07-03T10:05:00Z'), packageRef: 'Standart',
    content: 'Standart paket: 15 istifadəçi, ayda 450 AZN. Quraşdırma və təlim birdəfəlik 300 AZN.',
  }, SYSTEM);
  await createSource(gCase.id, {
    type: 'EMAIL', origin: 'DEMO_IMPORT', title: 'E-poçt: demo tarixi?', author: 'Elşən Babayev', authorSide: 'CUSTOMER', occurredAt: at('2026-07-10T09:30:00Z'),
    content: 'Demonun tarixi bəlli oldumu? Rəhbərlik bu ayın sonunda qərar verəcək. Bir də, 1C ilə inteqrasiya mümkündürmü?',
  }, SYSTEM);
  await createSource(gCase.id, {
    type: 'EMAIL', origin: 'DEMO_IMPORT', title: 'E-poçt: gecikmiş cavab', author: 'Nihat Zəkiyev', authorSide: 'COMPANY', occurredAt: at('2026-07-21T16:00:00Z'),
    content: 'Gecikmə üçün üzr istəyirik. 1C inteqrasiyası mümkündür. Demo üçün hansı gün sizə uyğundur?',
  }, SYSTEM);
  await createSource(gCase.id, {
    type: 'EMAIL', origin: 'DEMO_IMPORT', title: 'E-poçt: imtina', author: 'Elşən Babayev', authorSide: 'CUSTOMER', occurredAt: at('2026-07-23T11:00:00Z'),
    content: 'Artıq başqa şirkətlə davam etmək qərarına gəldik. Onlar demonu ilk həftə göstərdilər. Təşəkkür edirik.',
  }, SYSTEM);
  await prisma.lossAnalysis.create({ data: { caseId: gCase.id, agentReason: 'PRICE', agentNote: 'Müştəriyə qiymət baha gəldi.', createdById: nihat.id } });
  await runModule(gCase.id, 'WHYLOST', SYSTEM, {
    prepared: prepared([
      {
        kind: 'CUSTOMER_STATED_REASON', epistemic: 'OBSERVED', strength: 'STRONG',
        title: 'Müştəri: başqa şirkət demonu ilk həftə göstərdi',
        explanation: 'Müştərinin son mesajında açıq yazılan səbəb rəqibin demonu tez göstərməsidir. Qiymət barədə heç bir ifadə yoxdur.',
        evidence: [{ sourceRef: 'S6', quote: 'Artıq başqa şirkətlə davam etmək qərarına gəldik. Onlar demonu ilk həftə göstərdilər.' }],
        en: { title: 'Customer: another company showed the demo in the first week', explanation: "The customer's last message explicitly names the competitor's quick demo. Price is not mentioned." },
      },
      {
        kind: 'POSSIBLE_FACTOR', epistemic: 'INFERRED', strength: 'MEDIUM', data: { agreesWithAgentReason: false },
        title: 'Vəd edilən demo keçirilməyib — mümkün amil',
        explanation: 'Demo 3 iyulda "gələn həftə" vəd edilib, müştəri 10 iyulda tarixi soruşub; mənbələrdə demonun keçirildiyinə dair qeyd yoxdur.',
        evidence: [
          { sourceRef: 'S2', quote: 'Demonu gələn həftə təşkil edəcəyik, tarix barədə yazacağam.' },
          { sourceRef: 'S4', quote: 'Demonun tarixi bəlli oldumu?' },
        ],
        en: { title: 'The promised demo did not take place — possible factor', explanation: 'A demo was promised "next week" on 3 July and the customer asked for the date on 10 July; nothing shows the demo happened.' },
      },
      {
        kind: 'POSSIBLE_FACTOR', epistemic: 'INFERRED', strength: 'MEDIUM', data: { agreesWithAgentReason: false, replyHours: 270 },
        title: 'Gec cavab mümkün amildir (11 gün)',
        explanation: '10 iyul mesajına 21 iyulda cavab verilib; müştəri qərarın ay sonunda veriləcəyini yazmışdı. Bu, itkiyə təsir etmiş ola bilər, səbəb olduğu sübut edilmir.',
        evidence: [
          { sourceRef: 'S4', quote: 'Rəhbərlik bu ayın sonunda qərar verəcək.' },
          { sourceRef: 'S5', quote: 'Gecikmə üçün üzr istəyirik.' },
        ],
        en: { title: 'Slow reply is a possible factor (11 days)', explanation: 'The 10 July message was answered on 21 July while the decision was due at month end. It may have contributed; causation is not proven.' },
      },
      {
        kind: 'MISSING_INFO', epistemic: 'INFERRED', strength: 'MEDIUM',
        title: 'Qiymətin səbəb olduğunu təsdiqləyən müştəri ifadəsi yoxdur',
        explanation: 'Əməkdaş səbəb kimi "qiymət" seçib, lakin yazışmada müştəri qiymətlə bağlı narazılıq bildirməyib. Zəng qeydi varsa, əlavə edilməlidir.',
        suggestedAction: 'Müştəridən qısa rəy istəyin və ya zəng qeydini əlavə edin.',
        en: { title: 'No customer statement confirms price as the reason', explanation: 'The employee chose "price", but the customer never complained about price in writing. Add the call note if there is one.', suggestedAction: 'Ask the customer for short feedback or add the call note.' },
      },
      {
        kind: 'IMPROVEMENT', epistemic: 'INFERRED', strength: 'MEDIUM', data: { taskTitle: 'Demo tələbləri üçün 3 iş günü ərzində tarix təyin etmə qaydası' },
        title: 'Demo tələbinə 3 iş günü ərzində tarix təyin edilsin',
        explanation: 'Demo istəyən potensial müştərilər üçün avtomatik tapşırıq və son tarix yaradılması; 48 saatdan çox cavabsız mesaj üçün xatırlatma.',
        en: { title: 'Schedule requested demos within 3 working days', explanation: 'Create a task with a due date whenever a prospect asks for a demo; remind the owner when a message is unanswered for over 48 hours.' },
      },
    ]),
  });

  // ======================================================== 3. Xəzər Logistika — churned after repeated issues (ExitLens)
  const xazar = await prisma.customer.create({
    data: { name: 'Xəzər Logistika', industry: 'Logistika', contactName: 'Səbinə Kərimova', contactEmail: 'sabina@xazarlog.az', status: 'CHURNED' },
  });
  const x1 = await prisma.customerCase.create({
    data: {
      customerId: xazar.id, title: 'GPS hesabatları gəlmir', initialRequest: 'Gündəlik GPS izləmə hesabatları e-poçta gəlmir.',
      status: 'CLOSED', salesOutcome: 'NOT_APPLICABLE', ownerId: ataxan.id, closedAt: at('2026-05-12T12:00:00Z'),
      closeReason: 'Hesabat serveri yenidən başladıldı.', closedManually: true, createdAt: at('2026-05-08T09:00:00Z'),
    },
  });
  await createSource(x1.id, {
    type: 'EMAIL', origin: 'DEMO_IMPORT', title: 'E-poçt: hesabatlar gəlmir', author: 'Səbinə Kərimova', authorSide: 'CUSTOMER', occurredAt: at('2026-05-08T09:00:00Z'),
    content: 'Salam, üç gündür gündəlik GPS hesabatları e-poçtumuza gəlmir. Sürücülərin marşrutlarını yoxlaya bilmirik.',
  }, SYSTEM);
  await createSource(x1.id, {
    type: 'SUPPORT_REPLY', title: 'Dəstək cavabı', author: 'Ataxan Hacızadə', authorSide: 'COMPANY', occurredAt: at('2026-05-12T11:30:00Z'),
    content: 'Hesabat serverini yenidən başlatdıq, hesabatlar yenidən göndərilir.',
  }, SYSTEM);
  const x2 = await prisma.customerCase.create({
    data: {
      customerId: xazar.id, title: 'Hesabatlar yenə gəlmir', initialRequest: 'GPS hesabatları yenidən dayanıb.',
      status: 'REOPENED', salesOutcome: 'NOT_APPLICABLE', ownerId: ataxan.id, createdAt: at('2026-07-14T08:00:00Z'),
    },
  });
  await createSource(x2.id, {
    type: 'EMAIL', origin: 'DEMO_IMPORT', title: 'E-poçt: yenə hesabat yoxdur', author: 'Səbinə Kərimova', authorSide: 'CUSTOMER', occurredAt: at('2026-07-14T08:00:00Z'),
    content: 'Hesabatlar yenə gəlmir, bu dəfə bir həftədir. May ayında da eyni problem olmuşdu. Müştərilərimizə gecikmə izahı verə bilmirik.',
  }, SYSTEM);
  await createSource(x2.id, {
    type: 'SUPPORT_REPLY', title: 'Dəstək cavabı', author: 'Ataxan Hacızadə', authorSide: 'COMPANY', occurredAt: at('2026-07-16T10:00:00Z'),
    content: 'Serveri yenidən başlatdıq və hesabatlar göndərildi. Əgər problem təkrarlansa, xəbər verin.',
  }, SYSTEM);
  await prisma.resolutionCriterion.create({
    data: { caseId: x2.id, description: 'Hesabatlar 2 həftə fasiləsiz gəlir', evidenceRequired: 'Müştəri təsdiqi', requiresCustomerConfirmation: true, status: 'NOT_MET', evidenceNote: 'Müştəri cavabı: problem qalır' },
  });
  await prisma.customerConfirmation.create({ data: { caseId: x2.id, outcome: 'PROBLEM_REMAINS', note: 'İki gün sonra yenə dayandı.', createdAt: at('2026-07-25T09:00:00Z') } });
  await prisma.caseRelation.create({ data: { caseId: x2.id, relatedCaseId: x1.id, status: 'CONFIRMED', explanation: 'Eyni hesabat serveri problemi.', confirmedById: ataxan.id } });
  await prisma.task.create({
    data: { caseId: x2.id, title: 'Əsas səbəbi araşdır: hesabat serveri niyə dayanır', assigneeId: ataxan.id, dueDate: new Date(Date.now() - 5 * day), status: 'TODO', origin: 'ROOT_CAUSE' },
  });
  await prisma.handover.create({
    data: {
      caseId: x2.id, fromUserId: nihat.id, toUserId: ataxan.id, status: 'ACCEPTED', origin: 'DEMO_PREPARED', createdAt: at('2026-07-14T09:00:00Z'), acceptedAt: at('2026-07-14T10:15:00Z'),
      packageJson: toJson({ customerGoal: 'Gündəlik GPS hesabatlarının fasiləsiz gəlməsi.', currentState: 'Problem ikinci dəfə baş verib.', agreements: [], openBlockers: [], contradictions: [], collectedInfo: [], doNotAsk: [], nextSteps: [{ text: 'Serveri yoxlamaq' }], notes: [] }),
    },
  });
  const exitToken = await prisma.customerAccessToken.create({
    data: { tokenHash: `demo-used-${Date.now()}`, caseId: x2.id, purpose: 'EXIT', expiresAt: at('2026-08-15T00:00:00Z'), usedAt: at('2026-08-01T12:00:00Z') },
  });
  const exitMessages = [
    { role: 'assistant', text: 'Salam! Ayrılmaq qərarınızı anlamaq üçün bir neçə qısa sual vermək istərdik. İstənilən sualı keçə və ya söhbəti istənilən an bitirə bilərsiniz. Heç bir mesaj avtomatik göndərilmir.', at: '2026-08-01T11:50:00Z' },
    { role: 'assistant', text: 'Ayrılmaq qərarınıza ən çox nə təsir etdi?', at: '2026-08-01T11:50:00Z' },
    { role: 'customer', text: 'GPS hesabatları üç dəfə dayandı və hər dəfə yalnız server yenidən başladıldı. Əsas səbəbi heç kim izah etmədi.', at: '2026-08-01T11:52:00Z' },
    { role: 'assistant', text: 'Problemin həlli üçün bizdən nə gözləyirdiniz?', at: '2026-08-01T11:52:00Z' },
    { role: 'customer', text: 'Problemin niyə təkrarlandığını araşdırıb bizə yazılı izah verməyinizi və hesabat gəlməyəndə avtomatik xəbərdarlıq gözləyirdik.', at: '2026-08-01T11:54:00Z' },
    { role: 'assistant', text: 'Bu problem həll olunsa, gələcəkdə əməkdaşlığı yenidən nəzərdən keçirərdinizmi?', at: '2026-08-01T11:54:00Z' },
    { role: 'customer', text: 'Bəlkə. Hesabatlar sabit işləsə, danışa bilərik.', at: '2026-08-01T11:55:00Z' },
  ];
  const exitConv = await prisma.exitConversation.create({
    data: {
      customerId: xazar.id, caseId: x2.id, tokenId: exitToken.id, status: 'COMPLETED', completedAt: at('2026-08-01T11:56:00Z'), createdAt: at('2026-08-01T11:50:00Z'),
      messages: toJson(exitMessages),
      statedReasons: toJson(exitMessages.filter((m) => m.role === 'customer').map((m) => m.text)),
      summaryOrigin: 'DEMO_PREPARED',
      summary: toJson({
        statedReasons: exitMessages.filter((m) => m.role === 'customer').map((m) => m.text),
        aiHypotheses: [
          { text: 'Eyni hesabat problemi iki işdə təsdiqlənmiş təkrar kimi qeydə alınıb; hər dəfə yalnız simptom (server) aradan qaldırılıb. Ayrılma ilə əlaqəli ola bilər.', relatedCaseIds: [x1.id, x2.id], strength: 'STRONG' },
          { text: 'Müştəri son işdə "problem qalır" cavabı verib, əsas səbəb tapşırığı gecikib.', relatedCaseIds: [x2.id], strength: 'MEDIUM' },
        ],
        coreProblem: 'Təkrarlanan hesabat kəsintisi və əsas səbəbin izah edilməməsi',
        affectedService: 'GPS izləmə hesabatları',
        possibleFix: 'Hesabat serverinin kök səbəb analizi, hesabat göndərilmədikdə avtomatik xəbərdarlıq və müştəriyə yazılı izah.',
        missing: ['Demo üçün hazırlanmış xülasə (real model analizi deyil).'],
      }),
    },
  });
  await prisma.contactConsent.create({ data: { customerId: xazar.id, exitConversationId: exitConv.id, wantsUpdates: true } });

  // ======================================================== 4. Şəki Turizm — accepted discount is NOT a contradiction
  const seki = await prisma.customer.create({
    data: { name: 'Şəki Turizm', industry: 'Turizm', contactName: 'Kamran Hüseynov', contactEmail: 'kamran@sekitur.az', status: 'ACTIVE' },
  });
  const sCase = await prisma.customerCase.create({
    data: {
      customerId: seki.id, title: 'Onlayn bron modulu', initialRequest: 'Otel otaqları üçün onlayn bron.', coreNeed: 'Telefonla bron yükünü azaltmaq',
      status: 'IN_PROGRESS', salesOutcome: 'WON', ownerId: nihat.id, createdAt: at('2026-06-02T09:00:00Z'),
    },
  });
  await createSource(sCase.id, {
    type: 'PROPOSAL', title: 'Təklif: Premium paket', author: 'Nihat Zəkiyev', authorSide: 'COMPANY', occurredAt: at('2026-06-02T09:00:00Z'), packageRef: 'Premium',
    content: 'Premium paket: onlayn bron modulu — 1500 AZN, 6 ay dəstək daxildir.',
  }, SYSTEM);
  await createSource(sCase.id, {
    type: 'EMAIL', origin: 'DEMO_IMPORT', title: 'E-poçt: endirim sorğusu', author: 'Kamran Hüseynov', authorSide: 'CUSTOMER', occurredAt: at('2026-06-05T10:00:00Z'),
    content: 'Qiymət bir az yüksəkdir, endirim mümkündürmü?',
  }, SYSTEM);
  await createSource(sCase.id, {
    type: 'EMAIL', origin: 'DEMO_IMPORT', title: 'E-poçt: endirim razılaşması', author: 'Nihat Zəkiyev', authorSide: 'COMPANY', occurredAt: at('2026-06-06T12:00:00Z'), packageRef: 'Premium',
    content: 'Razılaşdırılmış endirimlə onlayn bron modulu 1200 AZN olacaq. Yenilənmiş müqaviləni göndəririk.',
  }, SYSTEM);
  await createSource(sCase.id, {
    type: 'CONTRACT', title: 'Əlavə razılaşma №1', author: 'Nihat Zəkiyev', authorSide: 'COMPANY', occurredAt: at('2026-06-08T12:00:00Z'), packageRef: 'Premium',
    content: 'Yenilənmiş müqavilə (əlavə razılaşma №1): onlayn bron modulu — 1200 AZN, razılaşdırılmış endirim tətbiq edilib. Dəstək müddəti: 6 ay.',
  }, SYSTEM);
  await runModule(sCase.id, 'ONEVOICE', SYSTEM, {
    prepared: prepared([
      {
        kind: 'CONTRADICTION', epistemic: 'OBSERVED', strength: 'WEAK',
        title: 'Bron modulu: 1500 AZN və 1200 AZN',
        explanation: 'Qiymət dəyişib, lakin bu, razılaşdırılmış endirim və yenilənmiş müqavilə ilə rəsmiləşdirilib.',
        evidence: [
          { sourceRef: 'S1', quote: 'onlayn bron modulu — 1500 AZN', label: 'A' },
          { sourceRef: 'S4', quote: 'onlayn bron modulu — 1200 AZN, razılaşdırılmış endirim tətbiq edilib', label: 'B' },
        ],
        data: { topic: 'PRICE', effectiveStatus: 'CONFLICT', resolvedByLaterAgreement: true },
        en: { title: 'Booking module: 1500 AZN vs 1200 AZN', explanation: 'The price changed, but through an agreed discount and an amended contract.' },
      },
    ]),
  });

  // ======================================================== 5. Lənkəran Aqro — different packages + incomplete info
  const lenk = await prisma.customer.create({
    data: { name: 'Lənkəran Aqro', industry: 'Kənd təsərrüfatı', contactName: 'Tural Nəsirov', contactEmail: 'tural@lankaranaqro.az', status: 'PROSPECT' },
  });
  const lCase = await prisma.customerCase.create({
    data: {
      customerId: lenk.id, title: 'Anbar uçotu proqramı', initialRequest: 'Anbar qalıqlarının uçotu.', status: 'SOLUTION_DESIGN', salesOutcome: 'OPEN', ownerId: nihat.id,
      createdAt: at('2026-09-10T09:00:00Z'),
    },
  });
  await createSource(lCase.id, {
    type: 'EMAIL', origin: 'DEMO_IMPORT', title: 'E-poçt: anbar uçotu', author: 'Tural Nəsirov', authorSide: 'CUSTOMER', occurredAt: at('2026-09-10T09:00:00Z'),
    content: 'Anbar qalıqlarını kağızda saxlayırıq və tez-tez səhv olur. İki variant görmək istəyirik: sadə və genişləndirilmiş.',
  }, SYSTEM);
  await createSource(lCase.id, {
    type: 'PROPOSAL', title: 'Təklif: Start paket', author: 'Nihat Zəkiyev', authorSide: 'COMPANY', occurredAt: at('2026-09-12T09:00:00Z'), packageRef: 'Start',
    content: 'Start paket: anbar uçotu modulu — 800 AZN, 1 istifadəçi.',
  }, SYSTEM);
  await createSource(lCase.id, {
    type: 'PROPOSAL', title: 'Təklif: Biznes paket', author: 'Nihat Zəkiyev', authorSide: 'COMPANY', occurredAt: at('2026-09-12T09:05:00Z'), packageRef: 'Biznes',
    content: 'Biznes paket: anbar uçotu modulu — 1400 AZN, 5 istifadəçi və barkod skaneri inteqrasiyası.',
  }, SYSTEM);
  await runModule(lCase.id, 'ONEVOICE', SYSTEM, {
    prepared: prepared([
      {
        kind: 'CONTRADICTION', epistemic: 'OBSERVED', strength: 'WEAK',
        title: 'Anbar modulu: 800 AZN və 1400 AZN',
        explanation: 'İki fərqli qiymət fərqli paketlərə aiddir.',
        evidence: [
          { sourceRef: 'S2', quote: 'anbar uçotu modulu — 800 AZN', label: 'A' },
          { sourceRef: 'S3', quote: 'anbar uçotu modulu — 1400 AZN', label: 'B' },
        ],
        data: { topic: 'PRICE', effectiveStatus: 'CONFLICT', resolvedByLaterAgreement: false },
        en: { title: 'Warehouse module: 800 AZN vs 1400 AZN', explanation: 'The two prices belong to different packages.' },
      },
    ]),
  });

  const lCase2 = await prisma.customerCase.create({
    data: {
      customerId: lenk.id, title: 'Mobil tətbiq sorğusu', initialRequest: 'Mobil tətbiq lazımdır.', status: 'NEEDS_CLARIFICATION', salesOutcome: 'OPEN', ownerId: nihat.id,
      createdAt: at('2026-10-06T09:00:00Z'),
    },
  });
  await createSource(lCase2.id, {
    type: 'WHATSAPP', origin: 'DEMO_IMPORT', title: 'WhatsApp: qısa sorğu', author: 'Tural Nəsirov', authorSide: 'CUSTOMER', occurredAt: at('2026-10-06T09:00:00Z'),
    content: 'Salam, bizə mobil tətbiq lazımdır. Nə qədər başa gəlir?',
  }, SYSTEM);
  await runModule(lCase2.id, 'BRIDGE', SYSTEM, {
    prepared: prepared(
      [
        {
          kind: 'EXPLICIT_REQUEST', epistemic: 'OBSERVED', strength: 'STRONG',
          title: 'Müştəri mobil tətbiq istəyir',
          explanation: 'Yeganə mesajda mobil tətbiq və qiymət soruşulur. Problem, istifadəçilər və funksiyalar barədə məlumat yoxdur — əsas ehtiyac müəyyən edilməyib.',
          evidence: [{ sourceRef: 'S1', quote: 'bizə mobil tətbiq lazımdır' }],
          en: { title: 'The customer wants a mobile app', explanation: 'The only message asks for a mobile app and its price. Nothing is known about the problem, users or features — the core need is not established.' },
        },
        {
          kind: 'QUESTION_TO_ASK', epistemic: 'INFERRED', strength: 'MEDIUM',
          title: 'Tətbiq hansı problemi həll etməlidir?',
          explanation: 'Qiymət vermək üçün əvvəlcə tətbiqin məqsədi bilinməlidir (məsələn, sifariş, anbar, sahə işçiləri).',
          en: { title: 'Which problem should the app solve?', explanation: 'Before quoting, the purpose of the app must be known (e.g. orders, warehouse, field staff).' },
        },
        {
          kind: 'QUESTION_TO_ASK', epistemic: 'INFERRED', strength: 'MEDIUM',
          title: 'Tətbiqdən kim istifadə edəcək və neçə nəfər?',
          explanation: 'İstifadəçilər (müştərilər yoxsa işçilər) və onların sayı həllin həcmini dəyişir.',
          en: { title: 'Who will use the app and how many people?', explanation: 'The users (customers or staff) and their number change the scope.' },
        },
        {
          kind: 'QUESTION_TO_ASK', epistemic: 'INFERRED', strength: 'WEAK',
          title: 'Büdcə və vaxt çərçivəsi varmı?',
          explanation: 'Mesajda büdcə və ya son tarix yoxdur.',
          en: { title: 'Is there a budget or timeline?', explanation: 'The message mentions no budget or deadline.' },
        },
      ],
      ['Müştərinin həll etmək istədiyi problem məlum deyil.', 'Platforma (iOS/Android), istifadəçi sayı, büdcə və tarix məlum deyil.', 'Qiymət təklifi üçün məlumat kifayət deyil — nəticə uydurulmadı.'],
    ),
  });

  // ======================================================== 6. Sumqayıt Aptek — active customer for the live ExitLens demo
  const aptek = await prisma.customer.create({
    data: { name: 'Sumqayıt Aptek', industry: 'Əczaçılıq', contactName: 'Günel Abbasova', contactEmail: 'gunel@sumaptek.az', status: 'ACTIVE' },
  });
  const aCase = await prisma.customerCase.create({
    data: {
      customerId: aptek.id, title: 'Kassa proqramı dəstəyi', initialRequest: 'Kassa proqramında çek çapı tez-tez dayanır.', status: 'IN_PROGRESS', salesOutcome: 'WON',
      ownerId: ataxan.id, createdAt: at('2026-09-28T09:00:00Z'),
    },
  });
  await createSource(aCase.id, {
    type: 'EMAIL', origin: 'DEMO_IMPORT', title: 'E-poçt: çek çapı', author: 'Günel Abbasova', authorSide: 'CUSTOMER', occurredAt: at('2026-09-28T09:00:00Z'),
    content: 'Kassa proqramında çek çapı gündə bir neçə dəfə dayanır. Növbə yaranır. Bu ay ikinci dəfədir yazırıq. Əgər həll olunmasa, müqaviləni yeniləməyəcəyik.',
  }, SYSTEM);
  await createSource(aCase.id, {
    type: 'SUPPORT_REPLY', title: 'Dəstək cavabı', author: 'Ataxan Hacızadə', authorSide: 'COMPANY', occurredAt: at('2026-09-30T10:00:00Z'),
    content: 'Printer sürücüsünü yenilədik. Zəhmət olmasa bir neçə gün izləyin və nəticəni bildirin.',
  }, SYSTEM);
  await prisma.resolutionCriterion.create({
    data: { caseId: aCase.id, description: 'Çek çapı 5 iş günü dayanmadan işləyir', evidenceRequired: 'Müştəri təsdiqi', requiresCustomerConfirmation: true },
  });
  await prisma.task.create({ data: { caseId: aCase.id, title: 'Müştəri ilə çek çapını yoxlamaq', assigneeId: ataxan.id, dueDate: new Date(Date.now() + 3 * day) } });

  await audit({ type: 'USER', id: admin.id, name: admin.name }, 'DEMO_SEEDED', { details: { customers: 6 } });

  const unverified = await prisma.evidence.count({ where: { verified: false } });
  if (unverified > 0) console.warn(`[seed] ${unverified} prepared quote(s) failed verification — check seed texts.`);
  return { users: { admin, nihat, ataxan } };
}

export type SeededModule = EngineModule;
