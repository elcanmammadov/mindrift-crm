import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Locale = 'az' | 'en';

type Dict = { [k: string]: string | Dict };

const az: Dict = {
  app: { name: 'Mindrift CRM', tagline: 'Müştərinin nə istədiyi, şirkətin nə vəd etdiyi və sonda nəyi həll etdiyi arasındakı boşluğu bağlayırıq.' },
  common: {
    save: 'Yadda saxla', cancel: 'Ləğv et', create: 'Yarat', edit: 'Redaktə et', delete: 'Sil', close: 'Bağla', add: 'Əlavə et',
    search: 'Axtar', loading: 'Yüklənir…', retry: 'Yenidən cəhd et', error: 'Xəta baş verdi', empty: 'Hələ məlumat yoxdur',
    yes: 'Bəli', no: 'Xeyr', all: 'Hamısı', optional: 'istəyə bağlı', required: 'Məcburi sahə', saved: 'Yadda saxlanıldı',
    actions: 'Əməliyyatlar', status: 'Vəziyyət', owner: 'Məsul', dueDate: 'Son tarix', date: 'Tarix', note: 'Qeyd',
    open: 'Aç', back: 'Geri', copy: 'Kopyala', copied: 'Kopyalandı', none: '—', details: 'Ətraflı', title: 'Başlıq',
    description: 'Təsvir', name: 'Ad', customer: 'Müştəri', case: 'İş', language: 'Dil', logout: 'Çıxış', overdue: 'gecikib',
    unassigned: 'Təyin edilməyib', showMore: 'Daha çox', showLess: 'Daha az',
  },
  nav: {
    dashboard: 'İdarə paneli', customers: 'Müştərilər', board: 'Tapşırıq və maneələr', handovers: 'Təhvillər',
    insights: 'İtki və ayrılma təhlili', integrations: 'İnteqrasiyalar', settings: 'AI parametrləri', menu: 'Menyu',
  },
  mode: {
    REAL: 'Real AI', DEMO: 'Oflayn rejim',
  },
  origin: {
    REAL_AI: 'Real AI', DEMO_PREPARED: 'Hazır nəticə', RULES: 'Qayda əsaslı (AI deyil)', MOCK: 'Test (mock)',
  },
  login: {
    title: 'Daxil olun', email: 'E-poçt', password: 'Şifrə', submit: 'Daxil ol', invalid: 'E-poçt və ya şifrə yanlışdır.',
    rateLimited: 'Çox sayda cəhd. Bir az sonra yenidən yoxlayın.',
    serverDown: 'Serverə qoşulmaq mümkün olmadı. Backend-in işlədiyini yoxlayın (npm run dev).',
    juryTitle: 'Münsiflər üçün giriş', juryFill: 'Məlumatları doldur',
  },
  dashboard: {
    title: 'İdarə paneli', subtitle: 'Bütün göstəricilər verilənlər bazasından hesablanır.',
    openCases: 'Açıq işlər', openContradictions: 'Açıq ziddiyyətlər', unresolvedBlockers: 'Həll olunmamış maneələr',
    overdueTasks: 'Gecikmiş tapşırıqlar', pendingHandovers: 'Qəbul edilməmiş təhvillər', awaitingConfirmation: 'Müştəri təsdiqi gözləyən işlər',
    repeatProblems: 'Təkrar problemlər', repeatDetail: '{confirmed} təsdiqlənib, {suggested} təklif', lostSales: 'İtirilmiş satışlar',
    churned: 'Ayrılmış müştərilər', myTasks: 'Mənim tapşırıqlarım', reviewQueue: 'Yoxlanmalı AI nəticələri',
    outdated: 'Analizi köhnəlmiş işlər', noTasks: 'Açıq tapşırıq yoxdur', noReview: 'Yoxlanmalı nəticə yoxdur',
  },
  customers: {
    title: 'Müştərilər', new: 'Yeni müştəri', searchPlaceholder: 'Ad, əlaqə, sənaye və ya iş başlığı…', industry: 'Sənaye',
    contactName: 'Əlaqə şəxsi', contactEmail: 'E-poçt', phone: 'Telefon', notes: 'Qeydlər', cases: 'İşlər', openCases: 'açıq',
    noResults: 'Müştəri tapılmadı', profile: 'Müştəri profili', newCase: 'Yeni iş', exitLink: 'Ayrılma söhbəti linki yarat',
    exitLinkHint: 'Link avtomatik göndərilmir — müştəriyə özünüz ötürün.', exitConversations: 'Ayrılma söhbətləri', consent: 'Gələcəkdə məlumat almaq istəyir',
    status: { PROSPECT: 'Potensial', ACTIVE: 'Aktiv', CHURNED: 'Ayrılıb' },
  },
  caseForm: {
    title: 'İşin başlığı', initialRequest: 'Müştərinin ilkin istəyi', coreNeed: 'Əsas ehtiyac', owner: 'Məsul əməkdaş',
  },
  case: {
    status: {
      NEW: 'Yeni', NEEDS_CLARIFICATION: 'Ehtiyac dəqiqləşdirilir', SOLUTION_DESIGN: 'Həll hazırlanır', IN_PROGRESS: 'İcradadır',
      AWAITING_CONFIRMATION: 'Təsdiq gözləyir', CLOSED: 'Bağlanıb', REOPENED: 'Yenidən açılıb',
    },
    sales: { OPEN: 'Açıq', WON: 'Qazanılıb', LOST: 'İtirilib', NOT_APPLICABLE: 'Tətbiq edilmir' },
    statusLabel: 'İş vəziyyəti', salesLabel: 'Satış nəticəsi', customerStatusLabel: 'Müştəri vəziyyəti',
    salesNote: '"Satış qazanılıb" işin həll olunduğu demək deyil.',
    tabs: {
      overview: 'Baxış', sources: 'Mənbələr və zaman xətti', need: 'Ehtiyac və təklif', contradictions: 'Ziddiyyətlər',
      blockers: 'Maneələr və tapşırıqlar', handover: 'Təhvil', resolution: 'Həllin təsdiqi', repeats: 'Təkrar problemlər', outcome: 'Nəticə təhlili',
    },
    analyze: 'AI ilə analiz et', analyzing: 'Analiz edilir…', reanalyze: 'Məcburi yenidən analiz',
    outdated: 'Mənbələr son analizdən sonra dəyişib — nəticələr köhnəlmiş ola bilər.', neverAnalyzed: 'Bu iş hələ analiz edilməyib.',
    analysisResult: { SUCCEEDED: 'tamamlandı', UNCHANGED: 'dəyişiklik yoxdur (mövcud nəticələr saxlanıldı)', FAILED: 'alınmadı' },
    stats: '{created} yeni, {updated} yeniləndi, {kept} insan qərarı saxlanıldı, {stale} köhnəldi',
    initialRequest: 'İlkin istək', coreNeed: 'Əsas ehtiyac', commitments: 'Razılaşmalar və vədlər', requirements: 'Təsdiqlənmiş ehtiyaclar',
    audit: 'Hadisə tarixçəsi', lastReply: 'Son əməkdaş cavabı', resolutionState: 'Həll vəziyyəti', addCommitment: 'Vəd əlavə et',
    commitmentStatus: { ACTIVE: 'Qüvvədə', SUPERSEDED: 'Əvəz olunub', DISPUTED: 'Mübahisəli' },
    noOwner: 'Məsul yoxdur', edit: 'İşi redaktə et',
  },
  sources: {
    add: 'Mənbə əlavə et', upload: 'Fayl yüklə (TXT / PDF)', type: 'Mənbə növü', author: 'Müəllif', sideLabel: 'Tərəf', occurredAt: 'Tarix və vaxt',
    packageRef: 'Paket / xidmət', content: 'Mətn', paste: 'Mətni yapışdırın…', file: 'Fayl', version: 'versiya', history: 'Dəyişiklik tarixçəsi',
    importedNote: 'Bu yazışma {channel} kanalından idxal edilib.', imported: 'İdxal edilib',
    noText: 'PDF-dən mətn çıxarıla bilmədi (skan ola bilər). OCR dəstəklənmir — mətni yapışdırın.',
    side: { CUSTOMER: 'Müştəri', COMPANY: 'Şirkət' },
    types: {
      EMAIL: 'E-poçt', WHATSAPP: 'WhatsApp', TELEGRAM: 'Telegram', CALL_NOTE: 'Zəng qeydi', MEETING_NOTE: 'Görüş qeydi', PROPOSAL: 'Təklif', CONTRACT: 'Müqavilə',
      SUPPORT_REPLY: 'Dəstək cavabı', INTERNAL_NOTE: 'Daxili qeyd', DOCUMENT: 'Sənəd',
    },
    empty: 'Mənbə yoxdur. Yazışma, təklif və ya sənəd əlavə edin.', archive: 'Arxivləşdir', archived: 'Mənbə arxivləşdirildi',
    archiveConfirm: 'Mənbə arxivləşdirilsin? Ona istinad edən nəticələr köhnəlmiş kimi görünəcək.', viewer: 'Mənbə', chunks: 'fraqment',
    changed: 'Mənbə bu sübut qeydə alındıqdan sonra dəyişib',
  },
  finding: {
    observed: 'Müşahidə', inferred: 'Ehtimal', strength: { STRONG: 'Güclü sübut', MEDIUM: 'Orta sübut', WEAK: 'Zəif sübut' },
    strengthHint: 'Sübutun gücü keyfiyyət qiymətləndirməsidir, statistik dəqiqlik deyil.',
    review: { PENDING: 'Yoxlanılmayıb', CONFIRMED: 'Təsdiqlənib', REJECTED: 'Rədd edilib', RESOLVED: 'Həll olunub' },
    confirm: 'Təsdiqlə', reject: 'Rədd et', resolve: 'Həll olunub', reopen: 'Yenidən yoxla', stale: 'Son analizdə təsdiqlənmədi (köhnəlmiş)',
    evidence: 'Sübutlar', unverified: 'Doğrulanmamış sitat — sübut kimi sayılmır', noEvidence: 'Birbaşa sitat yoxdur',
    suggested: 'Təklif olunan addım', toBlocker: 'Maneə kimi əlavə et', toTask: 'Tapşırıq yarat', toRequirement: 'Ehtiyac kimi saxla',
    linkRepeat: 'Təkrar kimi əlaqələndir', applyResolution: 'Maneəni həll olunmuş say', applyVerdict: 'Qiymətləndirməni qəbul et',
    created: 'Yaradıldı', side: { A: 'Mənbə A', B: 'Mənbə B' }, impact: 'Müştəriyə mümkün təsir', topic: 'Mövzu',
    kinds: {
      EXPLICIT_REQUEST: 'Açıq istək', CORE_PROBLEM: 'Əsas problem', SUCCESS_CRITERION: 'Uğur meyarı', CONSTRAINT: 'Məhdudiyyət',
      MATCH: 'Uyğun gələn', GAP: 'Təklifdə çatışmır', NOT_NEEDED: 'Ehtiyaca xidmət etmir', QUESTION_TO_ASK: 'Soruşulmalı sual',
      CONTRADICTION: 'Ziddiyyət', NEEDS_CLARIFICATION: 'Dəqiqləşdirmə tələb olunur', BLOCKER: 'Maneə təklifi', BLOCKER_RESOLUTION: 'Həll ehtimalı',
      REPEAT_CANDIDATE: 'Təkrar problem ehtimalı', VERDICT: 'Qiymətləndirmə', CUSTOMER_STATED_REASON: 'Müştərinin bildirdiyi səbəb',
      POSSIBLE_FACTOR: 'Mümkün amil', MISSING_INFO: 'Çatışmayan məlumat', IMPROVEMENT: 'Proses təklifi',
    },
    topics: {
      PRICE: 'Qiymət', SCOPE: 'Əhatə / xidmətlər', DELIVERY_DATE: 'Təhvil tarixi', SUPPORT_PERIOD: 'Dəstək müddəti', PAYMENT_REFUND: 'Ödəniş / geri qaytarma',
      TECH_CAPABILITY: 'Texniki imkan', RESPONSIBILITY: 'Məsuliyyət', OTHER: 'Digər',
    },
    certainty: { LIKELY: 'Ehtimal yüksəkdir', UNCERTAIN: 'Qeyri-müəyyən — əməkdaş qərar versin' },
  },
  run: {
    title: 'Son analiz', model: 'Model', at: 'Vaxt', notes: 'Qeydlər', failed: 'Analiz alınmadı', truncated: 'Bütün məzmun analiz edilməyib',
    never: 'Bu modul hələ işə salınmayıb', sources: 'İstifadə olunan mənbə versiyaları',
  },
  need: {
    stated: 'Açıq bildirilən', inferred: 'AI-nin çıxardığı ehtimal', fit: 'Təkliflə müqayisə', questions: 'Soruşulmalı suallar', missing: 'Çatışmayan məlumat',
  },
  contradictions: {
    none: 'Açıq ziddiyyət tapılmayıb.', aiNote: 'AI müqavilə və ya kommersiya şərtlərini dəyişmir — yalnız dəqiqləşdirmə təklif edir.',
  },
  blockers: {
    title: 'Maneələr', suggestions: 'AI maneə təklifləri', add: 'Maneə əlavə et', category: 'Kateqoriya', nextStep: 'Növbəti addım',
    resolutionCriteria: 'Aradan qaldırılma meyarı', evidenceQuote: 'Mənbə sübutu', none: 'Maneə yoxdur.',
    categories: {
      BUDGET: 'Büdcə', TECH_FIT: 'Texniki uyğunluq', DATA_MIGRATION: 'Məlumat köçürülməsi', SECURITY: 'Təhlükəsizlik sualları',
      INTERNAL_APPROVAL: 'Daxili təsdiq', UNCLEAR_TERMS: 'Qeyri-müəyyən şərtlər', UNANSWERED_QUESTION: 'Cavabsız sual', OTHER: 'Digər',
    },
    status: { OPEN: 'Açıq', IN_PROGRESS: 'Üzərində işlənir', WAITING_CUSTOMER: 'Müştəridən cavab gözlənilir', RESOLVED: 'Həll olunub' },
    resolutionHint: 'AI həll ehtimalını təklif edir, amma maneə yalnız insan təsdiqi ilə bağlanır.',
  },
  tasks: {
    title: 'Tapşırıqlar', add: 'Tapşırıq əlavə et', assignee: 'İcraçı', none: 'Tapşırıq yoxdur.',
    status: { TODO: 'Gözləyir', IN_PROGRESS: 'İcradadır', DONE: 'Tamamlanıb' },
    origin: { MANUAL: 'Əl ilə', FINDING: 'AI nəticəsindən', ROOT_CAUSE: 'Əsas səbəb', PROCESS_IMPROVEMENT: 'Proses təkmilləşdirməsi' },
  },
  board: { title: 'Tapşırıq və maneə lövhəsi', blockers: 'Maneələr', tasks: 'Tapşırıqlar', mine: 'Yalnız mənimkilər' },
  handover: {
    title: 'Təhvil', start: 'Təhvil başlat', to: 'Kimə', from: 'Kimdən', create: 'Təhvil paketi hazırla', accept: 'Təhvili qəbul et',
    accepted: 'Qəbul edilib', pending: 'Qəbul gözləyir', customerGoal: 'Müştərinin məqsədi', currentState: 'Cari vəziyyət',
    agreements: 'Qəbul edilmiş razılaşmalar', openBlockers: 'Açıq maneələr', contradictions: 'Ziddiyyətlər', collectedInfo: 'Artıq alınmış məlumat və sənədlər',
    doNotAsk: 'Yenidən soruşulmamalı suallar', nextSteps: 'Növbəti addımlar və tarixlər', notes: 'Qeydlər', onePerLine: 'Hər sətirdə bir bənd',
    onlyReceiver: 'Yalnız qəbul edən əməkdaş təhvili qəbul edə bilər.', history: 'Təhvil tarixçəsi', none: 'Təhvil yoxdur.',
    draftTitle: 'Mesaj qaralamasını yoxla', draftHint: 'Göndərməzdən əvvəl qaralamanın artıq cavablandırılmış sualı təkrarlayıb-təkrarlamadığını yoxlayın. Heç nə göndərilmir.',
    draftPlaceholder: 'Müştəriyə yazacağınız mesaj…', check: 'Yoxla', noRepeats: 'Təkrarlanan sual tapılmadı.',
    repeatWarning: 'Bu sual artıq cavablandırılıb', answeredIn: 'Cavab mənbəsi', list: 'Təhvillər',
  },
  resolution: {
    criteria: 'Həll meyarları', addCriterion: 'Meyar əlavə et', whatDone: 'Nə yerinə yetirilməlidir?', evidenceRequired: 'Hansı sübut tələb olunur?',
    needsCustomer: 'Müştəri təsdiqi lazımdır', evaluate: 'Sübutlarla müqayisə et', confirmationLink: 'Müştəri təsdiqi linki yarat',
    linkHint: 'Link avtomatik göndərilmir. Müştəriyə özünüz ötürün.', close: 'İşi bağla', manualClose: 'Admin: əl ilə bağla', reason: 'Səbəb',
    manualNote: 'Əl ilə bağlanma audit tarixçəsində saxlanılır və müştəri təsdiqi kimi göstərilmir.',
    replied: '"Əməkdaş cavab verdi" ilə "müştərinin problemi həll olundu" fərqli vəziyyətlərdir.',
    status: { PENDING: 'Gözləyir', MET: 'Yerinə yetirilib', NOT_MET: 'Yerinə yetirilməyib' },
    states: {
      NOT_EVALUATED: 'Qiymətləndirilməyib', INSUFFICIENT_EVIDENCE: 'Sübut kifayət deyil', UNRESOLVED: 'Həll edilməmiş məsələ qalır',
      EVIDENCE_SUPPORTED: 'Həll sübutlarla dəstəklənir', AWAITING_CUSTOMER: 'Sübut var — müştəri təsdiqi gözlənilir',
      CUSTOMER_CONFIRMED: 'Müştəri həlli təsdiqləyib', PROBLEM_REMAINS: 'Müştəri: problem qalır', MANUALLY_CLOSED: 'Admin tərəfindən əl ilə bağlanıb (müştəri təsdiqi deyil)',
    },
    verdicts: { SUPPORTED: 'Həll sübutlarla dəstəklənir', INSUFFICIENT: 'Sübut kifayət deyil', UNRESOLVED: 'Həll edilməmiş məsələ qalır' },
    blocking: {
      NO_CRITERIA: 'Həll meyarı təyin edilməyib', EVIDENCE_NOT_SUFFICIENT: 'Meyarlar sübutla təsdiqlənməyib',
      CUSTOMER_CONFIRMATION_MISSING: 'Müştəri təsdiqi yoxdur', CUSTOMER_REPORTED_PROBLEM_REMAINS: 'Müştəri problemin qaldığını bildirib',
    },
    cannotClose: 'İş hələ bağlana bilməz:', confirmations: 'Müştəri cavabları', customerSaid: { RESOLVED: 'Həll olunub', PROBLEM_REMAINS: 'Problem qalır' },
  },
  repeats: {
    title: 'Əlaqəli təkrar problemlər', confirmed: 'Təsdiqlənmiş əlaqələr', suggestions: 'AI təklifləri', occurrences: 'Problem {n} dəfə qeydə alınıb',
    previousSolution: 'Əvvəl tətbiq edilmiş həll', rootCause: 'Əsas səbəb üçün təklif', rootTask: 'Əsas səbəb tapşırığı yarat',
    sameTopic: 'Eyni mövzu həmişə eyni problem demək deyil. Əlaqələndirmə yalnız sizin təsdiqinizlə olur; işlər silinmir və birləşdirilmir.',
    manual: 'Əl ilə əlaqələndir', none: 'Əlaqəli iş yoxdur.', relatedCase: 'Əlaqəli iş',
  },
  outcome: {
    title: 'Satış itkisi təhlili', markLost: 'Satışı itirilmiş kimi qeyd et', reason: 'Əməkdaşın qeyd etdiyi səbəb', note: 'Əlavə qeyd', analyze: 'Səbəbləri təhlil et',
    reasons: { PRICE: 'Qiymət', COMPETITOR: 'Rəqib', TIMING: 'Vaxt / gecikmə', NO_DECISION: 'Qərar verilmədi', PRODUCT_FIT: 'Məhsul uyğun deyil', OTHER: 'Digər' },
    agentReason: 'Əməkdaşın səbəbi', customerStated: 'Müştərinin açıq bildirdiyi səbəb', factors: 'Sübutlarla dəstəklənən mümkün amillər',
    missing: 'Çatışmayan məlumat', improvements: 'Prosesin yaxşılaşdırılması üçün təkliflər', correlation: 'Korrelyasiya səbəb deyil: "mümkün amil" qəti səbəb demək deyil.',
    notLost: 'Satış nəticəsi "itirilib" deyil. Satış itirilibsə, əvvəlcə səbəbi qeyd edin.', agrees: 'Əməkdaşın səbəbi ilə uyğundur', disagrees: 'Əməkdaşın səbəbindən fərqlidir',
  },
  insights: {
    title: 'Satış itkisi və ayrılma təhlili', lost: 'İtirilmiş satışlar', churn: 'Ayrılan müştərilər', reasonCounts: 'Əməkdaşların qeyd etdiyi səbəblər',
    stated: 'Müştərinin öz sözləri', hypotheses: 'AI ehtimalları (təsdiqlənməyib)', coreProblem: 'Əsas problem', service: 'Təsirlənən xidmət', fix: 'Mümkün düzəliş',
    noLost: 'İtirilmiş satış yoxdur.', noChurn: 'Ayrılma söhbəti yoxdur.', conversation: 'Söhbət', relatedCases: 'Əlaqəli işlər',
    convStatus: { ACTIVE: 'Davam edir', COMPLETED: 'Tamamlanıb', SKIPPED: 'Müştəri söhbəti keçdi' },
  },
  camera: {
    tab: 'Kamera', snap: 'Şəkil çək', choose: 'Şəkil seç / çək', switch: 'Kameranı dəyiş', retake: 'Yenidən çək', preview: 'Çəkilmiş şəkil',
    starting: 'Kamera açılır…', unavailable: 'Canlı kamera əlçatan deyil (icazə verilməyib və ya cihazda kamera yoxdur). Şəkli cihazın kamerası ilə çəkin və ya qalereyadan seçin.',
    reading: 'Şəkildəki mətn oxunur…', hint: 'Sənədi, müqaviləni, qəbzi və ya əl yazısı qeydi çəkin — mətn AI ilə çıxarılacaq.',
    review: 'Mətn şəkildən avtomatik çıxarıldı. Saxlamadan əvvəl yoxlayın və lazım olsa düzəldin.', defaultTitle: 'Kamera ilə skan edilmiş sənəd',
  },
  settings: {
    title: 'AI parametrləri', aiMode: 'AI rejimi', apiKey: 'API açarı', configured: 'Serverdə təyin edilib', missing: 'Təyin edilməyib — yalnız oflayn rejim',
    model: 'Model', switchReal: 'Real AI-yə keç', switchDemo: 'Oflayn rejimə keç', test: 'Canlı AI yoxlaması', testOk: 'Real AI cavab verdi', testNotRun: 'Real AI yoxlanmadı',
    keyNote: 'API açarı yalnız serverdə saxlanılır və brauzerə göndərilmir.', users: 'İstifadəçilər', addUser: 'İstifadəçi əlavə et', role: 'Rol',
    roles: { ADMIN: 'Admin', AGENT: 'Əməkdaş' }, modesExplained: 'Oflayn rejimdə canlı AI çağırılmır: hazır nəticələr və ya məhdud qayda əsaslı analiz göstərilir və hər nəticənin mənbəyi işarələnir.',
  },
  integrations: {
    title: 'İnteqrasiyalar', subtitle: 'WhatsApp və Telegram mesajlarını CRM-ə qoşun. Gələn mesajlar qutuya düşür, siz onları uyğun işə əlavə edirsiniz.',
    connected: 'Qoşulub', disconnected: 'Qoşulmayıb', connect: 'Qoş', disconnect: 'Ayır', test: 'Bağlantını yoxla', testOk: 'Bağlantı işləyir',
    lastEvent: 'Son mesaj', keepHint: 'Saxlanılıb: {value}. Dəyişmək üçün yenisini yazın.', adminOnly: 'İnteqrasiyaları yalnız admin qura bilər.',
    webhookUrl: 'Webhook ünvanı', copy: 'Kopyala', syncNow: 'Mesajları indi çək', synced: '{n} yeni mesaj gəldi',
    inbox: 'Gələn mesajlar', emptyInbox: 'Hələ mesaj yoxdur.', chooseCase: 'İş seçin…', suggested: 'telefon nömrəsinə görə təklif',
    attach: 'İşə əlavə et', ignore: 'Yox say', attached: 'Mesaj mənbə kimi işə əlavə edildi.', newCount: '{n} yeni mesaj',
    status: { NEW: 'Yeni', ATTACHED: 'Əlavə edilib', IGNORED: 'Yox sayılıb' },
    fields: { phoneNumberId: 'Phone number ID', accessToken: 'Access token', verifyToken: 'Verify token (özünüz seçin)', appSecret: 'App secret (imza yoxlaması)', botToken: 'Bot token (@BotFather)' },
    WHATSAPP: {
      intro: 'Meta WhatsApp Business Cloud API. Meta Developers-da tətbiq yaradın, WhatsApp məhsulunu əlavə edin və aşağıdakı məlumatları daxil edin.',
      webhookHint: 'Bu ünvanı Meta-da Webhook kimi qeyd edin, eyni verify token-i yazın və "messages" sahəsinə abunə olun. Ünvan internetdən əlçatan olmalıdır (HTTPS, məsələn ngrok).',
    },
    TELEGRAM: {
      intro: 'Telegram-da @BotFather ilə bot yaradın və tokeni daxil edin. Müştərilərin bota yazdığı mesajlar avtomatik bura gələcək.',
      pollHint: 'Mesajlar hər 15 saniyədən bir avtomatik yoxlanılır. Public ünvan lazım deyil.',
    },
  },
  portal: {
    confirmTitle: 'Həllin təsdiqi', confirmIntro: '{customer} üçün "{case}" işi üzrə problemin həll olunub-olunmadığını bildirin.',
    criteria: 'Yoxlanılan meyarlar', resolved: 'Həll olunub', remains: 'Problem qalır', notePlaceholder: 'Qeydiniz (istəyə bağlı)', submit: 'Göndər',
    thanks: 'Təşəkkür edirik! Cavabınız qeydə alındı.', already: 'Bu link artıq istifadə olunub.', invalid: 'Link etibarsızdır və ya vaxtı bitib.',
    exitTitle: 'Qısa rəy söhbəti', exitIntro: 'Bu söhbət könüllüdür. Maksimum {n} sual veriləcək. İstənilən sualı keçə və ya söhbəti bitirə bilərsiniz.',
    start: 'Söhbətə başla', decline: 'İştirak etmək istəmirəm', answer: 'Cavabınız…', send: 'Göndər', skip: 'Sualı keç', finish: 'Söhbəti bitir',
    consentQ: 'Problem həll olunanda sizə məlumat verməyimizi istəyirsiniz?', consentYes: 'Bəli, məlumat verin', consentNo: 'Xeyr', consentSkip: 'Cavab vermirəm',
    exitDone: 'Vaxtınız üçün təşəkkür edirik. Cavablarınız komandamıza ötürüləcək. Heç bir mesaj avtomatik göndərilmir.',
    exitDeclined: 'Anlayışla qarşılayırıq. Söhbət bağlandı.', limitedAccess: 'Bu səhifə yalnız bu əməliyyat üçündür.',
  },
  audit: {
    actor: { USER: 'İstifadəçi', CUSTOMER: 'Müştəri', SYSTEM: 'Sistem', AI: 'AI' },
  },
  errors: {
    CLOSE_BLOCKED: 'İş bağlana bilməz — həll şərtləri ödənilməyib.', LOSS_REASON_REQUIRED: 'Əvvəlcə itki səbəbini qeyd edin.',
    FORBIDDEN: 'Bu əməliyyat üçün icazəniz yoxdur.', NOT_FOUND: 'Tapılmadı.', ALREADY_CREATED: 'Bu artıq yaradılıb.',
    RATE_LIMITED: 'Çox sayda sorğu. Bir az sonra yenidən cəhd edin.', PDF_NO_TEXT: 'PDF-dən mətn çıxarıla bilmədi (skan ola bilər). OCR dəstəklənmir — mətni yapışdırın.',
    UNSUPPORTED_TYPE: 'Yalnız TXT və mətn əsaslı PDF dəstəklənir.', HANDOVER_PENDING: 'Bu iş üçün artıq qəbul gözləyən təhvil var.',
    VALIDATION: 'Formu yoxlayın.', NO_API_KEY: 'Serverdə ANTHROPIC_API_KEY təyin edilməyib.', UNSUPPORTED_IMAGE: 'Yalnız JPEG, PNG və WebP şəkillər dəstəklənir.', INTEGRATION_INCOMPLETE: 'Qoşmaq üçün bütün vacib sahələri doldurun.', INTEGRATION_ERROR: 'Xidmətə qoşulmaq alınmadı.', ALREADY_HANDLED: 'Bu mesaj artıq emal olunub.', OCR_NO_TEXT: 'Şəkildə oxuna bilən mətn tapılmadı. Daha yaxından və işıqlı yerdə çəkin.', NOT_DEMO_MODE: 'Bu əməliyyat cari rejimdə mümkün deyil.',
    INVALID_JSON: 'AI cavabı yoxlamadan keçmədi.', TIMEOUT: 'AI sorğusunun vaxtı bitdi.', API_ERROR: 'AI xidməti xətası.', PRECONDITION: 'Əvvəlcə tələb olunan məlumatı daxil edin.',
  },
};

const en: Dict = {
  app: { name: 'Mindrift CRM', tagline: 'We close the gap between what the customer wanted, what the company promised and what was finally solved.' },
  common: {
    save: 'Save', cancel: 'Cancel', create: 'Create', edit: 'Edit', delete: 'Delete', close: 'Close', add: 'Add',
    search: 'Search', loading: 'Loading…', retry: 'Retry', error: 'Something went wrong', empty: 'Nothing here yet',
    yes: 'Yes', no: 'No', all: 'All', optional: 'optional', required: 'Required field', saved: 'Saved',
    actions: 'Actions', status: 'Status', owner: 'Owner', dueDate: 'Due date', date: 'Date', note: 'Note',
    open: 'Open', back: 'Back', copy: 'Copy', copied: 'Copied', none: '—', details: 'Details', title: 'Title',
    description: 'Description', name: 'Name', customer: 'Customer', case: 'Case', language: 'Language', logout: 'Log out', overdue: 'overdue',
    unassigned: 'Unassigned', showMore: 'Show more', showLess: 'Show less',
  },
  nav: { dashboard: 'Dashboard', customers: 'Customers', board: 'Tasks & blockers', handovers: 'Handovers', insights: 'Loss & churn analysis', integrations: 'Integrations', settings: 'AI settings', menu: 'Menu' },
  mode: { REAL: 'Real AI', DEMO: 'Offline mode' },
  origin: { REAL_AI: 'Real AI', DEMO_PREPARED: 'Prepared result', RULES: 'Rule-based (not AI)', MOCK: 'Test (mock)' },
  login: {
    title: 'Sign in', email: 'Email', password: 'Password', submit: 'Sign in', invalid: 'Invalid email or password.',
    rateLimited: 'Too many attempts. Try again later.',
    serverDown: 'Could not reach the server. Make sure the backend is running (npm run dev).',
    juryTitle: 'Jury sign-in', juryFill: 'Fill in the details',
  },
  dashboard: {
    title: 'Dashboard', subtitle: 'All numbers are computed from the database.', openCases: 'Open cases', openContradictions: 'Open contradictions',
    unresolvedBlockers: 'Unresolved blockers', overdueTasks: 'Overdue tasks', pendingHandovers: 'Handovers not yet accepted', awaitingConfirmation: 'Cases awaiting customer confirmation',
    repeatProblems: 'Repeat problems', repeatDetail: '{confirmed} confirmed, {suggested} suggested', lostSales: 'Lost deals', churned: 'Churned customers',
    myTasks: 'My tasks', reviewQueue: 'AI results to review', outdated: 'Cases with outdated analysis', noTasks: 'No open tasks', noReview: 'Nothing to review',
  },
  customers: {
    title: 'Customers', new: 'New customer', searchPlaceholder: 'Name, contact, industry or case title…', industry: 'Industry', contactName: 'Contact person',
    contactEmail: 'Email', phone: 'Phone', notes: 'Notes', cases: 'Cases', openCases: 'open', noResults: 'No customers found', profile: 'Customer profile',
    newCase: 'New case', exitLink: 'Create exit conversation link', exitLinkHint: 'The link is not sent automatically — share it with the customer yourself.',
    exitConversations: 'Exit conversations', consent: 'Wants to be notified in future',
    status: { PROSPECT: 'Prospect', ACTIVE: 'Active', CHURNED: 'Churned' },
  },
  caseForm: { title: 'Case title', initialRequest: "Customer's initial request", coreNeed: 'Core need', owner: 'Owner' },
  case: {
    status: {
      NEW: 'New', NEEDS_CLARIFICATION: 'Clarifying needs', SOLUTION_DESIGN: 'Designing solution', IN_PROGRESS: 'In progress',
      AWAITING_CONFIRMATION: 'Awaiting confirmation', CLOSED: 'Closed', REOPENED: 'Reopened',
    },
    sales: { OPEN: 'Open', WON: 'Won', LOST: 'Lost', NOT_APPLICABLE: 'Not applicable' },
    statusLabel: 'Case status', salesLabel: 'Sales outcome', customerStatusLabel: 'Customer status', salesNote: '"Deal won" does not mean the case is solved.',
    tabs: {
      overview: 'Overview', sources: 'Sources & timeline', need: 'Need & proposal', contradictions: 'Contradictions', blockers: 'Blockers & tasks',
      handover: 'Handover', resolution: 'Resolution check', repeats: 'Repeat problems', outcome: 'Outcome analysis',
    },
    analyze: 'Analyze with AI', analyzing: 'Analyzing…', reanalyze: 'Force re-analysis',
    outdated: 'Sources changed after the last analysis — results may be outdated.', neverAnalyzed: 'This case has not been analysed yet.',
    analysisResult: { SUCCEEDED: 'completed', UNCHANGED: 'no changes (existing results kept)', FAILED: 'failed' },
    stats: '{created} new, {updated} updated, {kept} human decisions kept, {stale} outdated',
    initialRequest: 'Initial request', coreNeed: 'Core need', commitments: 'Agreements & promises', requirements: 'Confirmed needs', audit: 'Event history',
    lastReply: 'Last employee reply', resolutionState: 'Resolution status', addCommitment: 'Add promise',
    commitmentStatus: { ACTIVE: 'In force', SUPERSEDED: 'Superseded', DISPUTED: 'Disputed' }, noOwner: 'No owner', edit: 'Edit case',
  },
  sources: {
    add: 'Add source', upload: 'Upload file (TXT / PDF)', type: 'Source type', author: 'Author', sideLabel: 'Side', occurredAt: 'Date & time',
    packageRef: 'Package / service', content: 'Text', paste: 'Paste the text…', file: 'File', version: 'version', history: 'Change history',
    importedNote: 'This conversation was imported from {channel}.', imported: 'Imported',
    noText: 'No text could be extracted from the PDF (it may be scanned). OCR is not supported — paste the text instead.',
    side: { CUSTOMER: 'Customer', COMPANY: 'Company' },
    types: {
      EMAIL: 'Email', WHATSAPP: 'WhatsApp', TELEGRAM: 'Telegram', CALL_NOTE: 'Call note', MEETING_NOTE: 'Meeting note', PROPOSAL: 'Proposal', CONTRACT: 'Contract',
      SUPPORT_REPLY: 'Support reply', INTERNAL_NOTE: 'Internal note', DOCUMENT: 'Document',
    },
    empty: 'No sources. Add a conversation, proposal or document.', archive: 'Archive', archived: 'Source archived',
    archiveConfirm: 'Archive this source? Results referencing it will show as outdated.', viewer: 'Source', chunks: 'fragments',
    changed: 'The source changed after this evidence was recorded',
  },
  finding: {
    observed: 'Observed', inferred: 'Inferred', strength: { STRONG: 'Strong evidence', MEDIUM: 'Medium evidence', WEAK: 'Weak evidence' },
    strengthHint: 'Evidence strength is a qualitative judgement, not statistical accuracy.',
    review: { PENDING: 'Not reviewed', CONFIRMED: 'Confirmed', REJECTED: 'Rejected', RESOLVED: 'Resolved' },
    confirm: 'Confirm', reject: 'Reject', resolve: 'Resolved', reopen: 'Review again', stale: 'Not confirmed by the latest analysis (outdated)',
    evidence: 'Evidence', unverified: 'Unverified quote — not counted as evidence', noEvidence: 'No direct quote',
    suggested: 'Suggested next step', toBlocker: 'Add as blocker', toTask: 'Create task', toRequirement: 'Save as need',
    linkRepeat: 'Link as repeat', applyResolution: 'Mark blocker resolved', applyVerdict: 'Accept evaluation',
    created: 'Created', side: { A: 'Source A', B: 'Source B' }, impact: 'Possible impact on the customer', topic: 'Topic',
    kinds: {
      EXPLICIT_REQUEST: 'Explicit request', CORE_PROBLEM: 'Core problem', SUCCESS_CRITERION: 'Success criterion', CONSTRAINT: 'Constraint',
      MATCH: 'Matches', GAP: 'Missing from proposal', NOT_NEEDED: 'Does not serve a need', QUESTION_TO_ASK: 'Question to ask',
      CONTRADICTION: 'Contradiction', NEEDS_CLARIFICATION: 'Needs clarification', BLOCKER: 'Blocker suggestion', BLOCKER_RESOLUTION: 'Possible resolution',
      REPEAT_CANDIDATE: 'Possible repeat problem', VERDICT: 'Evaluation', CUSTOMER_STATED_REASON: 'Reason stated by customer',
      POSSIBLE_FACTOR: 'Possible factor', MISSING_INFO: 'Missing information', IMPROVEMENT: 'Process suggestion',
    },
    topics: {
      PRICE: 'Price', SCOPE: 'Scope / services', DELIVERY_DATE: 'Delivery date', SUPPORT_PERIOD: 'Support period', PAYMENT_REFUND: 'Payment / refund',
      TECH_CAPABILITY: 'Technical capability', RESPONSIBILITY: 'Responsibility', OTHER: 'Other',
    },
    certainty: { LIKELY: 'Likely', UNCERTAIN: 'Uncertain — employee decides' },
  },
  run: {
    title: 'Last analysis', model: 'Model', at: 'Time', notes: 'Notes', failed: 'Analysis failed', truncated: 'Not all content was analysed',
    never: 'This module has not run yet', sources: 'Source versions used',
  },
  need: { stated: 'Explicitly stated', inferred: 'Inferred by AI', fit: 'Compared with the proposal', questions: 'Questions to ask', missing: 'Missing information' },
  contradictions: { none: 'No open contradictions found.', aiNote: 'The AI never changes contract or commercial terms — it only suggests clarification.' },
  blockers: {
    title: 'Blockers', suggestions: 'AI blocker suggestions', add: 'Add blocker', category: 'Category', nextStep: 'Next step',
    resolutionCriteria: 'Removal criterion', evidenceQuote: 'Source evidence', none: 'No blockers.',
    categories: {
      BUDGET: 'Budget', TECH_FIT: 'Technical fit', DATA_MIGRATION: 'Data migration', SECURITY: 'Security questions', INTERNAL_APPROVAL: 'Internal approval',
      UNCLEAR_TERMS: 'Unclear terms', UNANSWERED_QUESTION: 'Unanswered question', OTHER: 'Other',
    },
    status: { OPEN: 'Open', IN_PROGRESS: 'In progress', WAITING_CUSTOMER: 'Waiting for customer', RESOLVED: 'Resolved' },
    resolutionHint: 'The AI may suggest a blocker is resolved, but only a human can close it.',
  },
  tasks: {
    title: 'Tasks', add: 'Add task', assignee: 'Assignee', none: 'No tasks.', status: { TODO: 'To do', IN_PROGRESS: 'In progress', DONE: 'Done' },
    origin: { MANUAL: 'Manual', FINDING: 'From AI result', ROOT_CAUSE: 'Root cause', PROCESS_IMPROVEMENT: 'Process improvement' },
  },
  board: { title: 'Task & blocker board', blockers: 'Blockers', tasks: 'Tasks', mine: 'Only mine' },
  handover: {
    title: 'Handover', start: 'Start handover', to: 'To', from: 'From', create: 'Prepare handover package', accept: 'Accept handover',
    accepted: 'Accepted', pending: 'Awaiting acceptance', customerGoal: "Customer's goal", currentState: 'Current state', agreements: 'Accepted agreements',
    openBlockers: 'Open blockers', contradictions: 'Contradictions', collectedInfo: 'Information & documents already received', doNotAsk: 'Questions not to ask again',
    nextSteps: 'Next steps & dates', notes: 'Notes', onePerLine: 'One item per line', onlyReceiver: 'Only the receiving employee can accept this handover.',
    history: 'Handover history', none: 'No handovers.', draftTitle: 'Check a message draft',
    draftHint: 'Before sending, check whether the draft repeats a question the customer already answered. Nothing is sent.',
    draftPlaceholder: 'The message you plan to send…', check: 'Check', noRepeats: 'No repeated questions found.', repeatWarning: 'This was already answered',
    answeredIn: 'Answer source', list: 'Handovers',
  },
  resolution: {
    criteria: 'Resolution criteria', addCriterion: 'Add criterion', whatDone: 'What must be done?', evidenceRequired: 'What evidence is required?',
    needsCustomer: 'Customer confirmation required', evaluate: 'Compare with evidence', confirmationLink: 'Create customer confirmation link',
    linkHint: 'The link is not sent automatically. Share it with the customer yourself.', close: 'Close case', manualClose: 'Admin: close manually', reason: 'Reason',
    manualNote: 'A manual close is kept in the audit history and is never shown as customer confirmation.',
    replied: '"An employee replied" and "the customer\'s problem is solved" are different states.',
    status: { PENDING: 'Pending', MET: 'Met', NOT_MET: 'Not met' },
    states: {
      NOT_EVALUATED: 'Not evaluated', INSUFFICIENT_EVIDENCE: 'Not enough evidence', UNRESOLVED: 'An unresolved issue remains', EVIDENCE_SUPPORTED: 'Resolution supported by evidence',
      AWAITING_CUSTOMER: 'Evidence present — awaiting customer confirmation', CUSTOMER_CONFIRMED: 'Customer confirmed the resolution', PROBLEM_REMAINS: 'Customer: problem remains',
      MANUALLY_CLOSED: 'Closed manually by admin (not a customer confirmation)',
    },
    verdicts: { SUPPORTED: 'Resolution supported by evidence', INSUFFICIENT: 'Not enough evidence', UNRESOLVED: 'An unresolved issue remains' },
    blocking: {
      NO_CRITERIA: 'No resolution criteria defined', EVIDENCE_NOT_SUFFICIENT: 'Criteria are not backed by evidence', CUSTOMER_CONFIRMATION_MISSING: 'Customer confirmation missing',
      CUSTOMER_REPORTED_PROBLEM_REMAINS: 'The customer reported the problem remains',
    },
    cannotClose: 'The case cannot be closed yet:', confirmations: 'Customer answers', customerSaid: { RESOLVED: 'Resolved', PROBLEM_REMAINS: 'Problem remains' },
  },
  repeats: {
    title: 'Related repeat problems', confirmed: 'Confirmed links', suggestions: 'AI suggestions', occurrences: 'Problem recorded {n} times',
    previousSolution: 'Previously applied solution', rootCause: 'Root-cause suggestion', rootTask: 'Create root-cause task',
    sameTopic: 'The same topic is not always the same problem. Linking only happens with your confirmation; cases are never deleted or merged.',
    manual: 'Link manually', none: 'No related cases.', relatedCase: 'Related case',
  },
  outcome: {
    title: 'Lost deal analysis', markLost: 'Mark deal as lost', reason: 'Reason recorded by the employee', note: 'Additional note', analyze: 'Analyse reasons',
    reasons: { PRICE: 'Price', COMPETITOR: 'Competitor', TIMING: 'Timing / delay', NO_DECISION: 'No decision', PRODUCT_FIT: 'Product fit', OTHER: 'Other' },
    agentReason: "Employee's reason", customerStated: 'Reason stated by the customer', factors: 'Other possible factors supported by evidence',
    missing: 'Missing information', improvements: 'Process improvement suggestions', correlation: 'Correlation is not causation: a "possible factor" is not a definite cause.',
    notLost: 'The sales outcome is not "lost". If the deal was lost, record the reason first.', agrees: "Agrees with the employee's reason", disagrees: "Differs from the employee's reason",
  },
  insights: {
    title: 'Lost deal & churn analysis', lost: 'Lost deals', churn: 'Churned customers', reasonCounts: 'Reasons recorded by employees', stated: "Customer's own words",
    hypotheses: 'AI hypotheses (unconfirmed)', coreProblem: 'Core problem', service: 'Affected service', fix: 'Possible fix', noLost: 'No lost deals.',
    noChurn: 'No exit conversations.', conversation: 'Conversation', relatedCases: 'Related cases',
    convStatus: { ACTIVE: 'In progress', COMPLETED: 'Completed', SKIPPED: 'Customer skipped' },
  },
  camera: {
    tab: 'Camera', snap: 'Take photo', choose: 'Choose / take photo', switch: 'Switch camera', retake: 'Retake', preview: 'Captured photo',
    starting: 'Starting camera…', unavailable: 'Live camera is not available (permission denied or no camera). Take the photo with the device camera or choose it from the gallery.',
    reading: 'Reading the text in the photo…', hint: 'Photograph a document, contract, receipt or handwritten note — the text is extracted with AI.',
    review: 'The text was extracted from the photo automatically. Check and correct it before saving.', defaultTitle: 'Document scanned with camera',
  },
  settings: {
    title: 'AI settings', aiMode: 'AI mode', apiKey: 'API key', configured: 'Configured on the server', missing: 'Not set — offline mode only', model: 'Model',
    switchReal: 'Switch to real AI', switchDemo: 'Switch to offline mode', test: 'Live AI check', testOk: 'Real AI responded', testNotRun: 'Real AI was not tested',
    keyNote: 'The API key stays on the server and is never sent to the browser.',
    users: 'Users', addUser: 'Add user', role: 'Role', roles: { ADMIN: 'Admin', AGENT: 'Agent' },
    modesExplained: 'In offline mode no live AI is called: prepared results or a limited rule-based analysis are shown, and every result is labelled with its origin.',
  },
  integrations: {
    title: 'Integrations', subtitle: 'Connect WhatsApp and Telegram to the CRM. Incoming messages land in the inbox and you attach them to the right case.',
    connected: 'Connected', disconnected: 'Not connected', connect: 'Connect', disconnect: 'Disconnect', test: 'Test connection', testOk: 'Connection works',
    lastEvent: 'Last message', keepHint: 'Stored: {value}. Type a new value to change it.', adminOnly: 'Only an admin can set up integrations.',
    webhookUrl: 'Webhook URL', copy: 'Copy', syncNow: 'Fetch messages now', synced: '{n} new messages',
    inbox: 'Incoming messages', emptyInbox: 'No messages yet.', chooseCase: 'Choose a case…', suggested: 'suggested by phone number',
    attach: 'Attach to case', ignore: 'Ignore', attached: 'The message was added to the case as a source.', newCount: '{n} new messages',
    status: { NEW: 'New', ATTACHED: 'Attached', IGNORED: 'Ignored' },
    fields: { phoneNumberId: 'Phone number ID', accessToken: 'Access token', verifyToken: 'Verify token (choose your own)', appSecret: 'App secret (signature check)', botToken: 'Bot token (@BotFather)' },
    WHATSAPP: {
      intro: 'Meta WhatsApp Business Cloud API. Create an app in Meta for Developers, add the WhatsApp product and enter the details below.',
      webhookHint: 'Register this URL as the webhook in Meta, use the same verify token and subscribe to "messages". The URL must be reachable from the internet (HTTPS, e.g. ngrok).',
    },
    TELEGRAM: {
      intro: 'Create a bot with @BotFather in Telegram and enter its token. Messages customers send to the bot will appear here automatically.',
      pollHint: 'Messages are checked automatically every 15 seconds. No public URL is needed.',
    },
  },
  portal: {
    confirmTitle: 'Confirm the resolution', confirmIntro: 'Please tell us whether the problem in "{case}" for {customer} is solved.', criteria: 'What was checked',
    resolved: 'It is solved', remains: 'The problem remains', notePlaceholder: 'Your note (optional)', submit: 'Send', thanks: 'Thank you! Your answer was recorded.',
    already: 'This link has already been used.', invalid: 'The link is invalid or has expired.', exitTitle: 'Short feedback conversation',
    exitIntro: 'This conversation is voluntary. At most {n} questions. You can skip any question or end the conversation at any time.',
    start: 'Start', decline: 'I prefer not to take part', answer: 'Your answer…', send: 'Send', skip: 'Skip question', finish: 'End conversation',
    consentQ: 'Would you like us to let you know when the problem is solved?', consentYes: 'Yes, let me know', consentNo: 'No', consentSkip: "I'd rather not say",
    exitDone: 'Thank you for your time. Your answers will be passed to our team. No message is sent automatically.', exitDeclined: 'We understand. The conversation is closed.',
    limitedAccess: 'This page only allows this one action.',
  },
  audit: { actor: { USER: 'User', CUSTOMER: 'Customer', SYSTEM: 'System', AI: 'AI' } },
  errors: {
    CLOSE_BLOCKED: 'The case cannot be closed — resolution conditions are not met.', LOSS_REASON_REQUIRED: 'Record the loss reason first.',
    FORBIDDEN: 'You are not allowed to do this.', NOT_FOUND: 'Not found.', ALREADY_CREATED: 'This was already created.', RATE_LIMITED: 'Too many requests. Try again shortly.',
    PDF_NO_TEXT: 'No text could be extracted from the PDF (it may be scanned). OCR is not supported — paste the text.', UNSUPPORTED_TYPE: 'Only TXT and text-based PDF are supported.',
    HANDOVER_PENDING: 'There is already a pending handover for this case.', VALIDATION: 'Please check the form.', NO_API_KEY: 'ANTHROPIC_API_KEY is not set on the server.', UNSUPPORTED_IMAGE: 'Only JPEG, PNG and WebP images are supported.', INTEGRATION_INCOMPLETE: 'Fill in all required fields to connect.', INTEGRATION_ERROR: 'Could not reach the service.', ALREADY_HANDLED: 'This message was already handled.', OCR_NO_TEXT: 'No readable text was found. Take the photo closer and in better light.',
    NOT_DEMO_MODE: 'This action is not available in the current mode.', INVALID_JSON: 'The AI response failed validation.', TIMEOUT: 'The AI request timed out.', API_ERROR: 'AI service error.',
    PRECONDITION: 'Enter the required information first.',
  },
};

const dicts: Record<Locale, Dict> = { az, en };

function lookup(d: Dict, key: string): string | undefined {
  let cur: string | Dict | undefined = d;
  for (const part of key.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

interface I18nCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: TFn;
  /** Translate an enum value with a fallback to the raw value. */
  te: (prefix: string, value: string | null | undefined) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem('mindrift.locale');
    if (saved === 'az' || saved === 'en') return saved;
  } catch {
    /* storage unavailable */
  }
  return 'az';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem('mindrift.locale', l);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const t = useCallback<TFn>(
    (key, vars) => {
      let s = lookup(dicts[locale], key) ?? lookup(dicts.az, key) ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    },
    [locale],
  );
  const te = useCallback((prefix: string, value: string | null | undefined) => (value ? (lookup(dicts[locale], `${prefix}.${value}`) ?? value) : '—'), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t, te }), [locale, setLocale, t, te]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useI18n outside provider');
  return c;
}

/** Text of a finding in the current language (AI results carry an English translation). */
export function findingText<T extends { title: string; explanation: string; suggestedAction: string | null; translations: { en?: { title: string; explanation: string; suggestedAction?: string } } }>(
  f: T,
  locale: Locale,
) {
  const en = locale === 'en' ? f.translations?.en : undefined;
  return {
    title: en?.title || f.title,
    explanation: en?.explanation || f.explanation,
    suggestedAction: (en ? en.suggestedAction : f.suggestedAction) || f.suggestedAction,
  };
}
