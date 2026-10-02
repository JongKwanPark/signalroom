---
name: publish-edition
description: >-
  Writes Signal Daily edition stories and independent articles. Use when asked to write, edit, or
  publish a daily item, special feature, essay, analysis, or other edition content.
---

# Signal Daily 기사 작성과 배포

작업 유형을 먼저 구분하고 아래 소유 문서를 따른다.

- [docs/pipeline.md](../../../docs/pipeline.md) — 활성 자동 운영과 GitHub Actions 대기 경로
- [docs/manual-publish.md](../../../docs/manual-publish.md) — 수동 작성·검증·발행 절차
- [docs/editorial-guide.md](../../../docs/editorial-guide.md) — 카테고리와 편집 규칙
- [docs/glossary.md](../../../docs/glossary.md) — 한국어 용어
- `src/content.config.ts`, `scripts/validate.ts`, `scripts/validate-article.ts` — 스키마·검증의 기준

## 작업 경로

- 정기 자동 운영은 Paseo가 실행하는 프로덕션 흐름이다. 현재 자동 수집 대상은 `ai`, `bio`, `geo`,
  `markets` 네 카테고리이며, GitHub Actions는 cron이 비활성화된 대기 경로다. 실행 사실과 단계는
  [파이프라인](../../../docs/pipeline.md)을 기준으로 한다.
- 사용자가 링크·주제·의견으로 에디션 특집을 요청하면 1차 출처를 확인하고 사실과 의견을 구분한다.
  기존 날짜 파일을 포함한 한·영 입력을 만들고 새 스토리는 `publication: 'manual'`로 지정한다.
  `scripts/synth.ts --input-json`은 여섯 카테고리를 지원하고 입력의 `lang`으로 출력 파일명을 고른다.
  같은 날짜 스토리와 수동 발행 표시 보존 동작은 [`scripts/synth.ts`](../../../scripts/synth.ts)가
  소유한다. 입력 병합과 검증은 [수동 런북 §2](../../../docs/manual-publish.md#2-날짜별-에디션-특집)를 따른다.
- 독립 에세이·분석은 `src/content/articles/`의 Markdown 경로를 사용한다. 원문 언어만으로 발행할 수
  있고, 초안은 `draft` 기본값 `true`, 공개 글은 `draft: false`다. 개인 성찰의 출처·인용 규칙은
  [편집 가이드 §6-4](../../../docs/editorial-guide.md#6-4-독립-markdown-기사)를 따른다.

작성만 요청받은 경우 로컬 검증과 빌드에서 멈춘다. 사용자가 발행을 요청한 경우에만 커밋·push·
Vercel 프로덕션 배포를 진행하며, 세부 순서는 [수동 발행 런북](../../../docs/manual-publish.md)을
따른다.
