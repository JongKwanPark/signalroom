# Signal Daily 이중언어(한국어·영어) 발행 작업계획서

> 상태: 구현·통합 검증 및 프로덕션 공개 확인 완료(2026-09-25). 원격 commit/push 미수행으로 원격 `main`에는 미반영.
> 이 문서는 이중언어 발행의 목적·목표 아키텍처·작업 분해·순서·리스크·완료 정의를 고정한다.
> 충돌 시 타당성 조사 확정 사항(채택 방향·우선순위·리스크)이 이 문서보다 우선한다.
> 스키마·게이트의 SSOT는 `src/content.config.ts`·`scripts/validate.ts`이며, 본 문서는 코드를 변경하지 않는다.

## 1. 목적·범위·비범위

### 1-1. 목적

- Signal Daily 에디션을 한국어·영어로 발행한다. 스토리(콘텐츠) 번역을 먼저 하고, UI 번역은 다음 단계로 둔다.
- 언어별 경로(`/ko`, `/en`)에서 각 언어의 SEO·RSS·사이트맵·OG·검색이 독립적으로 동작하게 한다.

### 1-2. 범위

- 에디션 스토리 번역 파이프라인(영어 원문 → 한국어 번역본 생성·검증).
- 에디션 스키마의 언어 구분(`lang` 필드 또는 `ai.ko.json` 분리 중 하나 채택).
- 언어별 라우팅(`/ko`, `/en`), `<html lang>`·`og:locale` 분리, `hreflang` 세트(`ko`/`en`/`x-default`).
- 언어별 분리: sitemap·RSS·news-sitemap·검색 인덱스·OG 이미지.
- 에디토리얼 규칙 개정(번역 품질 게이트·용어집·승인 절차).

### 1-3. 비범위

- 동일 JSON 내 번역 필드 방식(예: `headline`/`headline_ko` 병기). 타당성 조사에서 제외로 확정됐다.
- UI 전면 번역(헤더·푸터·커맨드 팔레트 문구 등)은 본 계획의 후순위 단계로만 다룬다. 스토리 번역이 선행한다.
- 자동 번역 무인 발행. 사람 승인 리뷰는 유지한다.
- 신규 버티컬 추가, quiet-버티컬 스키마 변경, 분석 스크립트 도입.

## 2. 현황 요약

| 영역 | 현재 상태(확인済) | 근거 |
| --- | --- | --- |
| 사이트·콘텐츠 언어 | 100% 영어. 발행 필드 값은 영어로 작성하도록 규정 | `docs/editorial-guide.md` 20~23 |
| 에디션 스키마 | `lang`·다국어 필드 없음. 에디션(`date`, `generatedAt`, `vertical`, `title`, `summary`, `stories`) + 스토리(슬러그·헤드라인·본문·인용 등) 구조만 존재 | `src/content.config.ts` 39~49, 23~37 |
| 검증 게이트 | 언어 검사 없음. 스키마 미러 + 발행 게이트(distinct sources ≥ 2, 인용 해석, tldr 3문장 등)만 존재 | `scripts/validate.ts` 125~173 |
| SEO 메타 | `og:locale`은 `SITE.locale` 단일 값 출력, `hreflang`·대체 언어 링크 없음 | `src/components/SeoHead.astro` 34~51, `src/lib/site.ts` 1~9 |
| HTML 언어 | `<html lang="en">` 고정 | `src/layouts/BaseLayout.astro` 40 |
| RSS | `<language>en-us</language>` 고정, 언어별 피드 없음 | `src/pages/rss.xml.ts` 10~23 |
| news-sitemap | `<news:language>en</news:language>` 고정, 언어별 분리 없음 | `src/pages/news-sitemap.xml.ts` 22~27 |
| 사이트맵 설정 | i18n 설정 없음, 언어 prefix 처리 없음 | `astro.config.mjs` 41~60 |
| OG 이미지 | 라틴 전용 폰트 3종 로드(Inter Regular/SemiBold, JetBrains Mono Regular). 한글 렌더 불가 | `scripts/og.mjs` 238~253, `src/assets/fonts/` 실측(Inter 2종·JetBrains Mono 1종 + OFL 2종) |
| 라우팅 | 언어 prefix 없음. `href` 헬퍼는 prefix 없는 경로(`/story/<slug>`, `/<vertical>`, `/<date>`)만 생성 | `src/lib/editions.ts` 93~108, `src/pages/` 실측(`index.astro`, `story/[slug].astro`, `[vertical]/`, `[year]/` 존재) |
| 검색 | 단일 인덱스(`search-index.json.ts` → `buildSearchIndex`). 언어 필드·언어별 인덱스 없음 | `src/pages/search-index.json.ts` 5~14, `src/lib/search.ts` 1~35 |
| 프롬프트 | `triage`·`synthesis`·`editor` 모두 언어 지시 없음(영어 출력이 관례상 전제) | `scripts/prompts/triage.md`, `scripts/prompts/synthesis.md`, `scripts/prompts/editor.md` 전문 |
| JSON-LD | `articleJsonLd`·`websiteJsonLd` 등에 `inLanguage` 없음 | `src/lib/seo.ts` 43~60, 75~101 |

## 3. 목표 아키텍처

채택 방향(확정): 언어별 경로(`/ko`, `/en`) + 에디션 `lang` 필드(또는 `ai.ko.json` 분리) + SeoHead `hreflang` 세트 + sitemap·RSS·news-sitemap 언어별 분리 + `<html lang>`·`og:locale` 분리.

### 3-1. 스키마: `lang` 필드 vs 파일 분리

두 안 중 하나를 선택한다. 기본 권장안은 A안이다.

- **A안(권장): 에디션 `lang` 필드.** 기존 파일 레이아웃(`src/content/editions/<date>/<vertical>.json`)을 유지하고 에디션 객체에 `lang: 'ko' | 'en'`을 추가한다.
  - 장점: `validate.ts`·`editions.ts`·`astro.config.mjs` lastmod 인덱스의 변경 폭이 작다. 날짜×버티컬×언어의 유일성 검사가 한 곳에서 된다.
  - 주의: 같은 날짜·버티컬에 `en`/`ko` 2파일이 공존하므로, 파일명 충돌 방지 규칙이 필요하다(예: `<vertical>.json` = en 유지, `<vertical>.ko.json` = ko — 최종 명명은 구현 단계에서 확정).
- **B안: 언어별 파일 분리(`ai.ko.json`).** 파일명으로 언어를 구분하고 `lang` 필드는 두지 않는다.
  - 장점: 기존 en 파일 무변경.
  - 단점: 언어 판별 로직이 파일명 파싱에 분산되고, 실수로 en 파일을 ko로 읽는 오류를 타입으로 막기 어렵다.

어느 안이든 금지 사항은 동일하다: 스토리 객체 안에 번역 필드를 병기하지 않는다. `slug`는 언어별 독립(예: 동일 스토리의 ko 슬러그에 접미사 부여 여부)을 구현 단계에서 확정하고, 에디션 내·전역 중복 규칙을 `validate.ts`에 명시한다.

### 3-2. 라우팅: 언어별 경로

- `/en`·`/ko` prefix를 도입한다. 기존 무prefix 경로는 유지하되, 정식(canonical)은 언어별 경로로 한다(리다이렉트 vs 유지의 최종 결정은 라우팅 단계에서 확정).
- `editions.ts`의 `href` 헬퍼(`editionHref`, `storyHref`, `verticalHref`)에 언어 인자를 추가하고, `getStaticPaths`(예: `src/pages/story/[slug].astro` 24~27) 패턴을 언어별 페이지로 확장한다.
- UI 번역 전 단계에서는 페이지 크롬(헤더·푸터)은 기존 영어 그대로 두고, 스토리 본문만 해당 언어 콘텐츠를 렌더한다(content-first).

### 3-3. SEO: `hreflang`·`og:locale`·`<html lang>`

- `SeoHead.astro`(현재 34~51)에 `hreflang` 링크 세트(`ko`/`en`/`x-default`)와 `og:locale`·`og:locale:alternate`를 추가한다. 각 언어 페이지는 자기 언어를 canonical로, 타 언어를 alternate로 가리킨다.
- `BaseLayout.astro`(현재 40행 `lang="en"` 고정)를 언어 prop 기반으로 전환한다.
- `seo.ts`의 JSON-LD(`websiteJsonLd`, `articleJsonLd`)에 `inLanguage`를 추가한다.
- `SITE.locale` 단일 상수(`src/lib/site.ts` 7행) 체계를 언어별 로케일(`en_US`/`ko_KR`) 매핑으로 전환한다.

### 3-4. OG 이미지: 한글 폰트

- `scripts/og.mjs`의 `loadFonts`(238~253)에 한글 렌더 가능 폰트(예: Noto Sans KR + Noto Sans Mono 계열 또는 동등 OFL 폰트)를 추가한다. 기존 Inter·JetBrains Mono는 유지하고, 언어별 폰트 스택을 분기한다(ko 페이지는 한글 폰트 우선).
- 한글 줄바꿈 특성(영어 대비 chars-per-line 상이)에 맞춰 `wrap`·`clampText`(46~78)의 ko 파라미터를 별도 조정한다. 출력물은 언어별 경로로 분리한다(예: `dist/og/<slug>.png` vs `dist/og/<slug>.ko.png` — 최종 명명은 구현 단계 확정).

### 3-5. RSS·사이트맵·검색

- RSS: 언어별 피드(예: `/en/rss.xml`, `/ko/rss.xml`)로 분리하고 `<language>`를 `en-us`/`ko-kr`로 각각 출력한다. `BaseLayout.astro` 71행의 단일 alternate 링크를 언어별 alternate 세트로 교체한다.
- news-sitemap: 언어별 `<news:language>`(`en`/`ko`)로 분리 출력한다. 48시간 윈도 로직(`src/pages/news-sitemap.xml.ts` 8~12)은 유지한다.
- sitemap: `astro.config.mjs`의 `sitemap` 통합 설정을 언어별 경로 포함·`NOINDEX_PATHS`의 언어별 대응으로 확장한다.
- 검색: `buildSearchIndex`(`src/lib/search.ts` 33~35)에 언어 필드를 추가하고, 인덱스를 언어별로 분리(또는 단일 인덱스에 `lang` 필터)한다. 커맨드 팔레트·`search.astro`는 현재 언어 인덱스만 조회한다.

## 4. 작업 분해

각 작업은 변경 파일과 성공 기준을 함께 만족해야 완료로 인정한다.
상태 표기: `[완료]`는 보고된 성공 기준까지 확인, `[부분]`은 구현 또는 빌드 검증은 확인했으나 별도 확인이 남음, `[확인 필요]`는 근거가 보고되지 않은 항목이다.

### 4-1. 단계 1 — 번역 파이프라인(스토리 번역 먼저)

| # | 작업 | 변경 파일 | 성공 기준 |
| --- | --- | --- | --- |
| 1-1 [완료] | 번역 입력·출력 규격 확정(번역 단위: 에디션 전체 vs 스토리 단위, slug 규칙, 미번역 시 발행 차단 여부) | `docs/plan-bilingual.md`(본 문서 후속 개정), `docs/editorial-guide.md` §1-1 개정안 | 번역 단위·slug 규칙·차단 정책이 문서로 확정됨 |
| 1-2 [완료] | 번역 프롬프트 추가(영→한): 용어집 준수, 수치·고유명사 verbatim, YMYL no-advice 유지, 인용 id 보존 | `scripts/prompts/translate.md`(신규) | en 에디션 1건을 입력하면 스키마 유효한 ko 초안이 생성됨(게이트 통과는 1-4에서 확인); 통합 결과에서 schema 48/48, en↔ko 대응 24/24 |
| 1-3 [완료] | 한→영 역번역(필요 시) 또는 ko 원문 작성 경로 결정 | `scripts/prompts/*.md` 개정 또는 신규 | 주 작성 언어(en 유지) + 번역 방향이 문서로 확정됨 |
| 1-4 [완료] | 번역물 전용 검증(언어 감지·혼종 문장 검출·인용 id 일치·slug 유일성)을 `validate.ts`와 별도 스크립트 중 하나로 배치 | `scripts/validate.ts` 개정 또는 `scripts/validate-i18n.ts`(신규) 중 택1 | citation id multiset 비교를 보완한 뒤 승인 쌍 24/24 재통과. 독립 임시 KO 입력 5종(영어 잔존·혼종 문장·미해결 citation·citation id 치환·KO 중복 slug)이 모두 CLI exit 1 |

### 4-2. 단계 2 — 스키마·검증

| # | 작업 | 변경 파일 | 성공 기준 |
| --- | --- | --- | --- |
| 2-1 [완료] | 에디션 `lang` 필드 추가(A안) 또는 파일 분리 규칙 확정(B안) | `src/content.config.ts`, `scripts/validate.ts` | en·ko 에디션 schema 48/48 통과 |
| 2-2 [완료] | slug 유일성 규칙의 언어 스코프 확정(언어별 독립 허용 여부) 및 게이트 반영 | `scripts/validate.ts` 144~151 일대 | `validateEditionData`가 en·ko 에디션 각각에서 동언어 중복 slug를 거부함을 확인. 날짜 간 같은 언어 slug는 기존 newest-wins 정책 유지(이번 범위 밖) |
| 2-3 [완료] | `editions.ts`에 언어 타입·필터 추가(`getStoryRefs`의 언어 인자, `toStoryRef`의 언어 포함) | `src/lib/editions.ts` | ko/en 페이지와 검색 인덱스가 각각 130개 스토리로 분리됨 |

### 4-3. 단계 3 — 라우팅·UI(content-first)

| # | 작업 | 변경 파일 | 성공 기준 |
| --- | --- | --- | --- |
| 3-1 [완료] | 언어 prefix 라우팅(`/ko`, `/en`) 도입 및 `href` 헬퍼 언어 대응 | `src/lib/editions.ts` 93~108 일대, `src/pages/` 언어별 페이지(신규 또는 기존 확장), `astro.config.mjs` | 홈·스토리·날짜·월·버티컬·보관함·검색의 ko/en 페이지 구현 확인 |
| 3-2 [완료] | 무prefix 기존 URL 정책 확정(리다이렉트 vs canonical 유지) | `astro.config.mjs` 또는 미들웨어(신규 시) | 기존 `/story/<en-slug>`·`/story/<ko-slug>`가 대응 `/en`·`/ko` 경로로 HTTP 301 응답 확인 |
| 3-3 [완료] | UI 크롬은 영어 유지(이번 단계 변경 없음). 언어 전환 링크(ko↔en)만 추가 | `src/components/Header.astro`(또는 상당 컴포넌트), `src/layouts/BaseLayout.astro` | 공개 홈·대표 스토리에서 KO↔EN 양방향 링크와 목적지 HTTP 200 확인 |

### 4-4. 단계 4 — SEO·OG·RSS·검색

| # | 작업 | 변경 파일 | 성공 기준 |
| --- | --- | --- | --- |
| 4-1 [완료] | `hreflang` 세트 + `og:locale` 분리 + `<html lang>` 언어 prop | `src/components/SeoHead.astro`, `src/layouts/BaseLayout.astro`, `src/lib/site.ts`, `src/lib/seo.ts` | 언어별 HTML 메타 전수 확인: `lang`, canonical, `hreflang`, `og:locale` 출력 |
| 4-2 [완료] | JSON-LD `inLanguage` 추가 | `src/lib/seo.ts` 43~60·75~101 일대 | 언어별 구조화 데이터의 `inLanguage` 출력 확인 |
| 4-3 [완료] | 한글 OG 폰트 도입 + 언어별 OG 출력 분리 + ko 줄바꿈 조정 | `scripts/og.mjs`, `src/assets/fonts/`(폰트 추가), `src/pages/story/[slug].astro` 43행 일대(ogImage 경로) | OFL Noto Sans KR 및 언어별 OG 경로 확인. 1200×630 PNG 누락 0; 스토리 PNG 260개와 사이트 OG 2개 생성, 대표·최장 한글 제목 시각 확인 |
| 4-4 [완료] | RSS·news-sitemap· sitemap·검색 인덱스의 언어별 분리 | `src/pages/rss.xml.ts`, `src/pages/news-sitemap.xml.ts`, `astro.config.mjs`, `src/pages/search-index.json.ts`, `src/lib/search.ts`, `src/layouts/BaseLayout.astro` 71~74 일대 | RSS·news-sitemap·sitemap 교차 혼입 0; 언어별 검색 인덱스 130개씩, 내부 링크 9,160개 누락 0 |

### 4-5. 단계 5 — 에디토리얼 규칙

| # | 작업 | 변경 파일 | 성공 기준 |
| --- | --- | --- | --- |
| 5-1 [완료] | `editorial-guide.md` §1-1 개정(발행 언어 en→ko+en, 번역 우선순위, 혼종 문체 금지) | `docs/editorial-guide.md` | 한영 발행 규칙 개정 및 승인 기록 확인 |
| 5-2 [완료] | 용어집 도입(전문 용어 한·영 대역 고정: 모델명·기관명·지표명 등) | `docs/glossary.md`(신규) | 용어집 SSOT 작성, 6개 표준 용어와 승인된 문맥별 표현 반영 |
| 5-3 [부분] | 번역 editor pass 규칙 추가(수치 verbatim 재확인, YMYL 어조, 교차 버티컬 연결의 번역 충실도) | `scripts/prompts/editor.md` 개정 또는 `scripts/prompts/translate-review.md`(신규) | `editor.md`에 번역 리뷰 5개 항목과 언어별 승인·검증 규칙 반영, `translate.md`의 오래된 용어집 부재 문구 수정 및 diff check 완료. 별도 AI editor-pass 실행 이력은 없으며, 이번 발행은 사용자 직접 검토·승인, schema/i18n 검증, 용어집을 근거로 승인됨 |

### 4-6. 단계 6 — 검증·출시

| # | 작업 | 변경 파일 | 성공 기준 |
| --- | --- | --- | --- |
| 6-1 [완료] | 이중언어 발행 리허설(에디션 1일분 한·영 동시 생성 → validate → 빌드 → OG 생성) | 변경 없음(실행만) | schema 48/48, en↔ko 에디션 대응 24/24; Astro check 오류 0·경고 0(기존 hints 50); build 306페이지; 스토리 PNG 260개·사이트 OG 2개 생성 |
| 6-2 [완료] | SEO 검증(hreflang·canonical·locale·inLanguage·피드·사이트맵 스폿체크) | 변경 없음(실행만) | 공개 apex에서 en/ko 홈·대표 스토리·RSS·검색·일반/뉴스 sitemap 및 ko 날짜·버티컬·검색·OG HTTP 200. HTML 메타, 피드 언어, 검색 130/130, news-sitemap 52/52 분리 확인; 내부 링크 9,160개 누락 0; OG 1200×630 확인 |
| 6-3 [완료] | 사람 승인 리뷰(한·영 각 1회) 후 출시 | 변경 없음(절차) | 사용자 한영 전체 승인 및 공개 출시 확인 완료. Vercel deployment `dpl_CuuXH3q6Fh8pRxrkNHTNg4Xukj7E` READY (`https://signalroom-qrm13q6lt-mediio-net.vercel.app`, aliases `signaldaily.cloud`·`www.signaldaily.cloud`). 원격 commit/push는 미수행, 원격 `main` 미반영 |

## 5. 우선순위와 순서 의존성

순서(일정 가정 없음, 순서만):

```
1. 번역 파이프라인(§4-1) ── 스토리 번역 규격·프롬프트·검증
        │ 의존: 이후 단계의 테스트 입력(ko 샘플)이 여기서 나온다
        v
2. 스키마·검증(§4-2) ── lang 구분 + slug 유일성 + editions.ts 언어 필터
        │ 의존: 라우팅·SEO·피드가 언어 구분에 의존
        v
3. 라우팅·UI(§4-3) ── /ko·/en + 언어 전환 링크 (UI 번역은 제외)
        │ 의존: SEO·피드가 언어별 URL에 의존
        v
4. SEO·OG·RSS·검색(§4-4) ── hreflang·locale·폰트·피드 분리
        │ 의존: 에디토리얼 규칙의 검증 대상이 완성됨
        v
5. 에디토리얼 규칙(§4-5) ── 가이드·용어집·번역 리뷰
        v
6. 검증·출시(§4-6)
```

- content-first: 스토리 번역(§4-1·§4-2)이 UI 번역보다 항상 앞선다. UI 문구 번역 요청은 본 계획 범위 밖이며 별도 후속 계획으로 분리한다.
- §4-4의 OG 폰트 도입은 빌드 선행 조건이므로, 라우팅(§4-3) 완료 전이라도 폰트 라이선스(OFL 등) 확인은 병행 착수할 수 있다. 단, OG 출력 경로 명명은 §4-3의 URL 정책 확정 후에 고정한다.

## 6. 일정

일정 가정은 두지 않는다. 순서는 §5를 따른다.

## 7. 리스크·완화책

| 리스크 | 영향 | 완화책 |
| --- | --- | --- |
| 사람 승인 리뷰 2배(확정 리스크) | 발행 지연, 에디터 부하 | 번역 리뷰를 editor pass에 통합(§4-5)하고, 미승인 언어는 발행에서 제외하는 부분 출시 규칙 적용 |
| 전문 용어 일관성(확정 리스크) | 한·영 대역 불일치, 신뢰 저하 | `docs/glossary.md`를 SSOT로 두고 번역·리뷰 프롬프트에서 참조 강제(§4-5). 용어집 변경은 에디터 승인制 |
| 한글 OG 깨짐(폰트·줄바꿈) | 공유 카드 품질 저하 | OFL 한글 폰트 도입 + `assertPng` 유지 + ko 줄바꿈 파라미터 분리(§4-4). 리허설(§4-6)에서 대표 헤드라인으로目视 확인 |
| slug 충돌· canonical 중복 | SEO 중복 콘텐츠 판정 | slug 스코프를 구현 단계에서 확정하고 `validate.ts` 게이트로 강제(§4-2). 출시 전 canonical·hreflang 스폿체크(§4-6) |
| 기존 URL·구독자(피드·북마크) 파손 | 유입 손실 | 무prefix URL 정책을 리다이렉트로 귀결 권장(§4-3). 기존 피드 URL은 유지하거나 리다이렉트하고 신규 언어 피드를 추가 안내 |
| 검색 인덱스 혼입(ko 쿼리에 en 결과) | 검색 품질 저하 | 언어별 인덱스 분리 우선, 단일 인덱스 유지 시 `lang` 필터 필수(§4-4) |
| 한·영 발행 시점 어긋남(한쪽 지연) | 독자 혼란 | 날짜×버티컬×언어 단위의 독립 발행 + 미발행 언어는 해당 언어 페이지에서 직전 에디션 유지(현행 quiet-버티컬 표기 패턴 준용) |

## 8. 완료 정의

- [x] en·ko 에디션 schema 48/48 통과, 번역 대응 24/24 확인.
- [x] `/en`·`/ko` 언어별 페이지와 공개 홈·대표 스토리의 양방향 언어 전환 링크 확인.
- [x] 언어별 `<html lang>`·`og:locale`·`hreflang`·JSON-LD `inLanguage` 확인.
- [x] 언어별 RSS·news-sitemap·sitemap·검색 인덱스 분리, 교차 혼입 0건.
- [x] ko OG 1200×630 PNG 누락 0, 스토리 PNG 260개·사이트 OG 2개 생성; 대표·최장 한글 제목 시각 확인.
- [x] 에디토리얼 가이드·용어집·번역 editor pass 규칙 반영 및 양언어 사용자 승인 기록 완료. 별도 AI editor-pass 실행 이력은 없음.
- [x] 영어·한국어 에디션 파일 분리로 동일 JSON 내 번역 필드 병기 방식 미도입.

## 9. 단계 1 후속 결정 (1-1~1-4, 확정)

> 추가 전용 섹션. 기존 §1~§8 내용은 변경하지 않는다.

- **1-1 규격** (`docs/editorial-guide.md` §1-1): 번역 단위 = 스토리 단위(에디션 `title`·`summary`는
  포함 스토리와 함께 번역). slug = en slug + `-ko` 접미사, ASCII kebab 유지(한글 slug 금지).
  미번역·게이트 미통과 스토리는 해당 언어 에디션에서 제외(부분 발행). en은 ko와 무관하게 발행.
  동일 JSON 병기·무인 발행 금지, 언어별 사람 승인 유지.
- **1-2 프롬프트** (`scripts/prompts/translate.md` 신규): 용어집 SSOT = `docs/glossary.md`
  (미존재 시 `TODO-glossary` 표기 — 단계 1 한시 규칙). 수치·고유명사 verbatim, YMYL no-advice,
  인용 id·`sources`·`cluster` verbatim 보존, 스키마 유효 출력.
- **1-3 방향** (확정): 주 작성 언어 en 유지, 번역 방향 `en → ko` 단일. `ko → en` 역번역·ko 원문
  작성은 범위 밖. `triage`·`synthesis`·`editor` 프롬프트에 방향 고정 문구 삽입.
- **1-4 검증** (`scripts/validate-i18n.ts` 신규, `scripts/validate.ts` 무변경): 간이 휴리스틱
  언어 감지(한글 부재 = 영어 잔존 실패), 혼종 문장 검출(한글 문장 내 장문 라틴 연속 구간),
  인용 id·cluster URL parity(en↔ko slug base 매칭), slug 유일성(`-ko` 접미사·에디션 내 중복·en
  대응). 사용법: `npx tsx scripts/validate-i18n.ts <ko.json> [--en <en.json>]`.
  en 에디션 1건 → ko 초안 → 실패 검출 흐름의 테스트 진입점은 exported 함수
  (`validateI18n`, `checkKoreanPresence`, `checkMixedSentences`, `checkCitationParity`,
  `checkSlugRules`)다.
