# Mindrift CRM

> **Müştərinin nə istədiyi, şirkətin nə vəd etdiyi və sonda nəyi həll etdiyi arasındakı boşluğu bağlayırıq.**
> *We close the gap between what the customer wanted, what the company promised and what was finally solved.*

Mindrift CRM müştərinin ehtiyacını, verilən vədləri və faktiki nəticəni **vahid iş (Customer Case)** üzərində izləyən AI əsaslı CRM-dir. İnterfeys iki dillidir (**Azərbaycan / English**, yuxarıda AZ/EN düyməsi), kod və texniki identifikatorlar ingiliscədir.

---

## 1. Vahid problem və həll

**Problem.** Müştərinin ehtiyacı və razılaşmalar satışdan dəstəyə qədər vahid şəkildə izlənmədiyi üçün şirkət yanlış həll təklif edir, məlumatlar əməkdaşlar arasında itir, həll olunmamış problemlər bağlanmış kimi göstərilir və nəticədə müştəri itirilir.

**Həll.** Bütün səkkiz funksiya ayrı məhsul deyil — hamısı eyni işin mənbələri (yazışma, təklif, müqavilə, dəstək cavabı) üzərində işləyir:

| Modul (UI adı) | Nə edir |
|---|---|
| **Ehtiyac və təklif** (Bridge) | Açıq istək / əsas problem / uğur meyarı / məhdudiyyətləri çıxarır, təkliflə müqayisə edir: uyğun, çatışmayan, ehtiyaca xidmət etməyən, soruşulmalı suallar. Açıq bildirilən ilə AI ehtimalı ayrı göstərilir. |
| **Ziddiyyətlər** (OneVoice) | Mənbələr arası qiymət, əhatə, tarix, dəstək, ödəniş, texniki imkan ziddiyyətləri — iki dəqiq sitat, müəllif, tarix, təsir, düzəliş təklifi, insan təsdiqi. Fərqli paketlər və sonradan razılaşdırılmış dəyişikliklər ziddiyyət sayılmır. |
| **Maneələr** (Unblock) | Satışı/işi saxlayan maneələr (8 kateqoriya), məsul, növbəti addım, son tarix, aradan qaldırılma meyarı, 4 vəziyyət. Yeni mesajdan "həll ehtimalı" təklif edir, amma təsdiqsiz bağlamır. |
| **Təhvil** (Relay) | Məsul dəyişəndə redaktə edilə bilən təhvil paketi; yeni əməkdaş "Təhvili qəbul et" ilə qəbul edir; tarixçə saxlanılır. Qaralamada artıq cavablandırılmış sualın təkrarını (düymə ilə) mənbəsi ilə xəbərdar edir. |
| **Həllin təsdiqi** (ProofClose) | "Əməkdaş cavab verdi" ≠ "problem həll olundu". Redaktə edilə bilən meyarlar, sübutla müqayisə, müştəri təsdiqi ekranı. Müştəri təsdiqi tələb olunursa, AI müsbət desə belə iş bağlanmır. Admin əl ilə bağlaya bilər — auditdə qalır, müştəri təsdiqi kimi göstərilmir. |
| **Təkrar problemlər** (Loop) | Yeni müraciəti müştərinin əvvəlki işləri ilə müqayisə edir; yalnız insan təsdiqi ilə əlaqələndirir (silmə/birləşdirmə yoxdur); əsas səbəb tapşırığı. |
| **Satış itkisi təhlili** (WhyLost) | Əməkdaşın səbəbi ↔ müştərinin açıq dediyi ↔ sübutlu "mümkün amillər" (korrelyasiya səbəb kimi göstərilmir) ↔ çatışmayan məlumat ↔ təkmilləşdirmə tapşırığı. |
| **Ayrılma söhbəti** (ExitLens) | Könüllü, maks. 4 sual, keçmək/bitirmək olar, təkrar sual verilmir; müştərinin öz sözləri AI ehtimallarından ayrı saxlanılır; əvvəlki işlərlə əlaqələndirilir; "məlumat almaq istəyirəm" razılığı ayrıca seçilir. Heç bir mesaj avtomatik göndərilmir. |

İşin **əməliyyat vəziyyəti**, **satış nəticəsi** və **müştəri vəziyyəti** ayrı sahələrdir ("satış qazanılıb" ≠ "iş həll olunub").

---

## 2. Quraşdırma və işə salma

Tələblər: **Node.js 20.19+ (yoxlanılıb: 22.15)**, npm 10.

```bash
cd mindrift-crm
npm run setup     # server/.env yaradır (.env.example-dən, təsadüfi SESSION_SECRET), npm install, migration, seed
npm run dev       # API: http://localhost:4000   UI: http://localhost:5173
```

Açın: **http://localhost:5173**

Ayrı-ayrı əmrlər:

| Əmr | Nə edir |
|---|---|
| `npm run db:deploy` | Prisma migration-larını tətbiq edir (`server/prisma/migrations`) |
| `npm run db:migrate` | Development: sxem dəyişikliyindən yeni migration (`prisma migrate dev`) |
| `npm run db:seed` | Demo məlumatlarını yenidən yaradır (müştəri/iş məlumatlarını silir, istifadəçiləri yeniləyir) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Server testləri (mock AI ilə, ayrı `prisma/test.db`) |
| `npm run test:live-ai` | Canlı Anthropic API yoxlaması (açar yoxdursa yoxlanmadığını bildirir) |
| `npm run build` && `npm start` | Production: server `client/dist`-i eyni portda (4000) təqdim edir |

> Production-u HTTP üzərində lokal yoxlayırsınızsa `COOKIE_SECURE=false` təyin edin; HTTPS arxasında default olaraq `Secure` cookie istifadə olunur.

### Hesablar (şifrə: `admin1234`)

| E-poçt | Rol | Nümunə məlumatdakı rolu |
|---|---|---|
| elcan@mindrift.az | Admin (Elcan Məmmədov) | Hər şeyi görür, əl ilə bağlama, AI rejimi, məlumat sıfırlama |
| nihat@mindrift.az | Agent (Nihat Zəkiyev) | Bakı Retail satışı; təhvili verir; itirilmiş satış (Gəncə Mebel) |
| ataxan@mindrift.az | Agent (Ataxan Hacızadə) | Təhvili qəbul edir; dəstək işləri |

**Münsiflər üçün:** `mindrift@gmail.az` / `mindrift2026` (admin; giriş səhifəsində göstərilir).

---

## 3. Real AI və demo rejimi

`server/.env`:

```
DATABASE_URL="file:./dev.db"
ANTHROPIC_API_KEY=""            # boşdursa — yalnız demo rejimi
ANTHROPIC_MODEL="claude-opus-5-5"
SESSION_SECRET="..."
DEMO_MODE="true"                # false + açar = Real AI
PORT=4000
FRONTEND_URL="http://localhost:5173"
```

* **Real AI** — `ANTHROPIC_API_KEY` təyin edilib və `DEMO_MODE=false` (və ya Admin → "AI və demo parametrləri" → "Real AI-yə keç"). Bütün sorğular backend-dən gedir; açar brauzerə/bundle-a düşmür (production bundle yoxlanılıb). Model `ANTHROPIC_MODEL` ilə dəyişir.
* **Demo** — açar olmadan işləyir. Yuxarıda sarı zolaq və hər nəticədə mənşə nişanı var:
  * `Demo: hazır nəticə` — seed ssenariləri üçün əvvəlcədən hazırlanmış nəticələr. Onlar da eyni sübut yoxlamasından keçir (bütün sitatlar mənbədə tapılır).
  * `Qayda əsaslı (AI deyil)` — demo rejimində yeni/tanınmayan məlumat üçün məhdud açar söz/regex analizi. Uydurma "AI nəticəsi" qaytarılmır. Zəif mühərrik güclü nəticələri (hazır və ya real AI) nə üzərinə yazır, nə də köhnəlmiş edir.
  * `Real AI` — canlı model nəticəsi (model adı, vaxt və istifadə olunan mənbə versiyaları analiz qeydində saxlanılır).
* **Demo sıfırlama** yalnız demo rejimində mümkündür (Admin → parametrlər).

### AI etibarlılığı (necə qurulub)

* **Provider adapter**: `server/src/ai/provider.ts` (interfeys) → `anthropic.ts` (real), `mock.ts` (testlər). Başqa provayderə keçid üçün yalnız yeni adapter lazımdır.
* Cavab strukturlaşdırılmış JSON kimi alınır, **Zod** ilə yoxlanılır; yanlış JSON-da bir "təmir" cəhdi, sonra idarə olunan xəta (`INVALID_JSON`) + "Yenidən cəhd et" düyməsi. Timeout, rate limit, API xətaları ayrıca kodlarla göstərilir; SDK 408/429/5xx üçün avtomatik təkrar edir. Opus 5.5 / Sonnet 5.5 / Fable 5.1 üçün server tərəfli refusal fallback (`fallbacks: "default"`) aktivdir.
* Mənbələr modelə `S1, S2…` ləqəbləri ilə, `<source>` teqləri arasında **etibarsız data** kimi verilir — mətn daxilindəki təlimatlar əmr sayılmır.
* Backend **hər mənbə ID-sini** yoxlayır (mövcud olmayanlar atılır) və **hər sitatı mənbə mətnində axtarır** (boşluq/dırnaq/registrə dözümlü, `...` ilə qısaltma). Tapılmayan sitat sübut kimi göstərilmir; sübutsuz "müşahidə" avtomatik "ehtimal / zəif sübut"a endirilir.
* Ziddiyyətlər üçün deterministik qoruyucular: iki doğrulanmış sitat tələbi, fərqli paket → ziddiyyət deyil, sonradan razılaşdırılmış dəyişiklik → ziddiyyət deyil, "hansının qüvvədə olduğu bilinmir" → "dəqiqləşdirmə tələb olunur".
* "Sübutun gücü" (güclü/orta/zəif) keyfiyyət qiymətləndirməsidir, faiz göstərilmir.
* Uzun sənədlər sabit fraqmentlərə bölünür (`SourceChunk`, ID: `<sourceId>:v<versiya>:<index>`); giriş limiti (`AI_MAX_INPUT_CHARS`) aşılırsa analiz edilməyən fraqmentlər istifadəçiyə göstərilir.
* **Təkrar analiz çoxaltmır**: giriş hash-i (mənbə versiyaları + əlaqəli məlumat + prompt versiyası) dəyişməyibsə model çağırılmır ("dəyişiklik yoxdur"). Dəyişibsə nəticələr barmaq izi, AI-nin `existingFindingId`-si və sitat üst-üstə düşməsi ilə uyğunlaşdırılır. İnsan qərarları (təsdiq/rədd) heç vaxt səssizcə dəyişdirilmir. Mənbə dəyişəndə iş səviyyəsində "analiz köhnəlib" xəbərdarlığı və hər sübutda "mənbə dəyişib" nişanı görünür.
* AI heç nəyi təsdiqsiz icra etmir: maneə yaratmaq, maneəni bağlamaq, işləri əlaqələndirmək, tapşırıq yaratmaq, işi bağlamaq — hamısı insan düyməsidir. Müştəriyə heç bir mesaj avtomatik göndərilmir (linklər əməkdaşa göstərilir).

---

## 4. Arxitektura

```
mindrift-crm/                 npm workspaces monorepo
├─ server/                    Node + Express 5 + TypeScript (ESM)
│  ├─ prisma/schema.prisma    SQLite + Prisma 6 (migration + seed)
│  ├─ src/ai/                 provider adapter (Anthropic / mock)
│  ├─ src/analysis/           kontekst, promptlar, Zod sxemləri, sübut yoxlaması, qayda mühərriki, mühərrik (dedup)
│  ├─ src/modules/            sources, relay (təhvil), proofclose (bağlama qaydaları), exitlens, tokens
│  ├─ src/routes/             REST API (auth, customers, cases, sources, findings, work, handovers, insights, public, settings)
│  ├─ src/seed/demo.ts        Azərbaycanca demo ssenariləri
│  └─ tests/                  vitest + supertest
└─ client/                    React 18 + TypeScript + Vite 6 + Tailwind CSS 4 + TanStack Query
   └─ src/pages/case/         iş detalının 9 bölməsi
```

**Əsas modellər:** User, Session, Customer, CustomerCase, Source, SourceRevision, SourceChunk, AnalysisRun, Finding, Evidence, Requirement, Commitment, Blocker, Task, Handover, ResolutionCriterion, CustomerConfirmation, CustomerAccessToken, CaseRelation, LossAnalysis, ExitConversation, ContactConsent, AuditEvent, AppSetting.
Sadələşdirmə: **Proposal** ayrıca cədvəl deyil — `PROPOSAL`/`CONTRACT` tipli mənbədir (paket sahəsi ilə); bu, təklifin də eyni sitat/versiya mexanizmindən keçməsini təmin edir.

**Təhlükəsizlik:**
* Rollar backend-də yoxlanılır: Admin hər şeyi; Agent yalnız ona təyin edilmiş işləri (+ ona ünvanlanmış qəbul gözləyən təhvili). İç-içə resurslar (mənbə, nəticə, maneə, tapşırıq, meyar) da işin icazəsi ilə yoxlanılır.
* Müştəri linkləri: 32 baytlıq təsadüfi token, bazada yalnız HMAC-ı, 14 gün müddət; token yalnız bir iş və bir əməliyyat (təsdiq **və ya** ayrılma söhbəti) üçün; təsdiq linki bir dəfəlikdir.
* Şifrələr bcrypt; sessiya `httpOnly` + `SameSite=Lax` cookie (token bazada HMAC kimi); state dəyişən sorğularda `X-Requested-With` CSRF başlığı; helmet.
* Rate limit: login 10/15 dəq, AI endpoint-ləri 30/10 dəq (istifadəçi üzrə), müştəri linkləri 60/10 dəq.

---

## 5. Hakaton nümayiş ssenarisi (3–5 dəqiqə)

> Demo rejimində işləyir. Başlamazdan əvvəl: Admin → parametrlər → **Demo məlumatlarını sıfırla** (və ya `npm run db:seed`).

1. **(0:00) Problem.** Login səhifəsindəki cümlə. "Bakı Retail sayt istəyir, amma əsl problemi WhatsApp-da itən sifarişlərdir."
2. **(0:30) Ataxan kimi daxil olun** → İdarə paneli: açıq ziddiyyətlər, gecikmiş tapşırıq, **qəbul edilməmiş təhvil**, təkrar problemlər — hamısı bazadan hesablanır.
3. **(0:50) Müştərilər → Bakı Retail → "Onlayn mağaza saytı" → Ehtiyac və təklif.** "Açıq bildirilən" vs "AI ehtimalı"; **Boşluq: təklifdə sifariş qeydiyyatı yoxdur**; bloq ehtiyaca xidmət etmir; soruşulmalı suallar. Sitata klikləyin → mənbə açılır, sitat vurğulanır.
4. **(1:30) Ziddiyyətlər.** "WhatsApp inteqrasiyası pulsuz" (e-poçt, A) vs "150 AZN" (təklif, B), müəllif/tarix, müştəriyə təsir. "AI şərti dəyişmir — rəhbərlik qərar verir."
5. **(1:55) Maneələr.** Cavabsız köçürmə sualı → **"Maneə kimi əlavə et"** (məsul, son tarix, meyar). "AI ilə analiz et" düyməsini təkrar basın → "dəyişiklik yoxdur", heç nə çoxalmır.
6. **(2:20) Təhvil.** Nihat → Ataxan paketi: məqsəd, razılaşmalar, açıq maneələr, **yenidən soruşulmamalı suallar**. Qaralamaya "Neçə məhsul kateqoriyanız var?" yazın → **Yoxla** → mənbəli xəbərdarlıq. **Təhvili qəbul et.**
7. **(2:50) Həllin təsdiqi.** Sayt işə salınıb, amma qiymətləndirmə: "Həll edilməmiş məsələ qalır". **İşi bağla** düyməsi bloklanıb (səbəblərlə). **Müştəri təsdiqi linki** → yeni tab (mobil görünüş) → "Problem qalır" → iş **Yenidən açılıb**.
8. **(3:30) Təkrar problemlər.** "Sifarişlər yenə itir" işi → AI 2 əvvəlki işi təklif edir (2025 Excel həlli və sayt) → **Təkrar kimi əlaqələndir** → **Əsas səbəb tapşırığı**.
9. **(3:55) İtki və ayrılma.** Admin kimi: Gəncə Mebel — əməkdaş "qiymət" yazıb, müştəri isə "rəqib demonu ilk həftə göstərdi" deyib; "gec cavab (11 gün) **mümkün amildir**", "demo keçirilməyib". Xəzər Logistika — müştərinin öz sözləri ilə AI ehtimalları ayrı. (Canlı: Sumqayıt Aptek → "Ayrılma söhbəti linki" → 4 sual, keçmək/bitirmək, razılıq.)
10. **(4:30) Etibarlılıq.** EN düyməsi ilə dili dəyişin; Parametrlər: demo/real rejim, açar yalnız serverdə; "Normal hallar": Şəki Turizm (razılaşdırılmış endirim ziddiyyət deyil), Lənkəran Aqro (fərqli paketlər ziddiyyət deyil; "Mobil tətbiq sorğusu" — natamam məlumat → nəticə uydurulmur, suallar göstərilir).

### Qısa təqdimat mətni

> Şirkətlər müştərini çox vaxt pis məhsula görə yox, **boşluqlara** görə itirir: satış bir şey vəd edir, təklif başqa şey yazır, dəstək "cavab verdik" deyib işi bağlayır, yeni əməkdaş eyni sualı üçüncü dəfə soruşur. **Mindrift CRM** müştərinin istəyini, şirkətin vədini və faktiki nəticəni bir iş üzərində birləşdirir. AI yazışmalardan əsl ehtiyacı, ziddiyyətləri, maneələri, təkrar problemləri və itki səbəblərini çıxarır — amma hər nəticə **mənbədən dəqiq sitatla** sübut olunur, ehtimal müşahidədən ayrılır və **heç bir qərar insan təsdiqi olmadan icra edilmir**. İş yalnız problem həqiqətən həll olunanda — lazım gələrsə müştərinin öz təsdiqi ilə — bağlanır.

---

## 6. Yoxlamalar (bu mühitdə icra edilib)

| Yoxlama | Nəticə |
|---|---|
| `npm run lint` (ESLint, server + client) | ✅ keçdi |
| `npm run typecheck` (server + client) | ✅ keçdi |
| `npm test` — 30 test, 4 fayl | ✅ keçdi |
| `npm run build` (server tsc + client vite) | ✅ keçdi |
| Production bundle-da API açarı yoxdur | ✅ yoxlanılıb (yalnız xəta mətnində env adı var) |
| Brauzer E2E (headless Chrome, production build) | ✅ login → dashboard → ehtiyac → sitat vurğulanması → ziddiyyət → maneə qəbulu → təhvil qəbulu → qaralama yoxlaması → bağlama bloku → müştəri təsdiqi (mobil) → təkrar əlaqələndirmə → ayrılma söhbəti → EN interfeys, 390px-də üfüqi sürüşmə yoxdur |
| Təzə quraşdırma (`npm run setup` + `npm test`, node_modules/DB/.env olmadan ayrı kataloqda) | ✅ keçdi (migration, seed, 30 test) |
| **Canlı Anthropic API** | ⚠️ **Yoxlanmayıb** — bu mühitdə `ANTHROPIC_API_KEY` yoxdur. Açarla: `npm run test:live-ai` və ya Parametrlər → "Canlı AI yoxlaması". |

Testlərin əhatəsi: sitat və mənbə yoxlaması; paket və tarix/razılaşma fərqlərinin ziddiyyətdə nəzərə alınması; təkrar analizdə nəticə və maneələrin çoxalmaması; insan qərarlarının qorunması; yanlış JSON → idarə olunan xəta; rol və müştəri tokeni icazələri (agent başqa agentin işinə daxil ola bilmir, token başqa işə giriş vermir, müddəti bitmiş token); təsdiq tələb olunan işin təsdiqsiz bağlanmaması (AI müsbət desə belə); admin əl ilə bağlamanın auditdə qalması; təkrar problemin yalnız təsdiqlə əlaqələndirilməsi; demo rejimində qayda mühərrikinin hazır nəticələri pozmaması.

## 7. Məlum məhdudiyyətlər

* Real AI promptları canlı modellə bu mühitdə sınaqdan keçirilməyib (açar yoxdur); struktur, yoxlama və xəta axını mock provider ilə test olunub.
* Qayda əsaslı demo analizi məhduddur (açar söz/regex); semantik uyğunluq üçün real AI lazımdır — interfeys bunu açıq yazır.
* Skan PDF üçün OCR yoxdur (aydın xəta mesajı göstərilir); E-poçt/WhatsApp real inteqrasiyası yoxdur — demo yazışmalar "idxal edilmiş nümunə" kimi işarələnib.
* Rate limit sayğacları prosesin yaddaşındadır (çox serverli quraşdırmada paylaşılan store lazımdır).
* Bildiriş/e-poçt göndərişi yoxdur (qəsdən: heç bir mesaj avtomatik göndərilmir).

## 8. Texniki qərarlar

* **Prisma 6.19** (7 deyil): Prisma 7 driver adapter və `prisma.config.ts` tələb edir; hakaton üçün sabit 6.x seçildi. `package.json#prisma` xəbərdarlığı zərərsizdir.
* **Express 5**: async xətaları avtomatik error middleware-ə ötürür.
* **Tailwind CSS 4 + öz komponentlər** (shadcn üslubunda `components/ui.tsx`): shadcn CLI əvəzinə — asılılıq az, nəticə eyni.
* **Zod 3** (stabil API), **unpdf** (saf JS PDF mətn çıxarışı, native asılılıq yoxdur), **bcryptjs** (Windows-da native build tələb etmir).
* SQLite enum dəstəkləmədiyi üçün vəziyyət sahələri string-dir; icazə verilən dəyərlər `server/src/domain/enums.ts`-də və Zod ilə yoxlanılır.
* Test bazası (`prisma/test.db`) hər test qaçışında yenidən yaradılır; dev bazasına toxunulmur.

---

## English summary

Mindrift CRM is an AI-assisted CRM where eight capabilities (need↔proposal fit, cross-source contradictions, blockers, handovers, resolution proof, repeat problems, lost-deal analysis, exit conversations) all work on the same **Customer Case** and its sources. Every AI result carries verified verbatim quotes, observed vs. inferred labels and a qualitative evidence strength. Nothing is executed without a human. Run `npm run setup && npm run dev`, open http://localhost:5173 and log in with `elcan@mindrift.az` / `admin1234`. Without an API key the app runs in a clearly labelled demo mode; set `ANTHROPIC_API_KEY` and `DEMO_MODE=false` for real AI. The UI language toggles between Azerbaijani and English.
