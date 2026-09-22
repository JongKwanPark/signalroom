# 시그널 데일리 수동 발행 런북

> 정기 자동 발행(07:00·19:00 KST, paseo 스케줄)과 별개로, 운영자가 직접 승인·실행하는 긴급 수동 발행 절차를 고정한다.
> 자동화는 draft만 커밋하고, 승인 후 발행한다 — 수동 발행은 운영자 승인 행위다.

## 1. 목적과 적용 범위

- **목적**: 스케줄 자동 발행 외에, 운영자가 승인해 직접 실행하는 수동 발행 절차를 기록한다.
- **적용 범위**: `main` 브랜치에서 데일리 에디션을 수동으로 발행하는 작업.
- **스케줄 자동 발행**: 매일 07:00·19:00 KST 2회 스케줄이 collect → dedup → synth → validate → draft 커밋까지
  수행한다.
- **운영자 수동 발행**: 운영자가 스케줄 외에 직접 실행한다. 자동화는 draft만 커밋하고, 승인 후
  발행한다.

## 2. 절차

### [0] 전제

- 레포: `/Users/parkjongkwan/Devs/projects/signalroom`
- 브랜치: `main`
- Vercel CLI 인증됨
- 수동 발행은 운영자 승인 행위다. 자동화는 draft만 커밋하고, 승인 후 발행한다.

### [1] UTC 날짜 고정

스케줄 런북과 동일하게 UTC 날짜를 쓴다.

```bash
DATE=$(date -u +%F)
```

KST 저녁에 수동 발행하면 다음 자동 스케줄(07:00·19:00 KST)과 같은 UTC 날짜가 겹칠 수 있다(주의사항).

### [2] 미커밋 사이트·문서 변경 정리

미커밋 사이트·문서 변경이 있으면 먼저 그린을 확인하고 별도 커밋(①)으로 정리한다.

```bash
npm run build
```

미커밋 상태로 push하면 Vercel git 연동이 구버전을 프로덕션에 배포할 수 있다.

### [3] 원격 동기화

클린 트리에서 실행한다.

```bash
git fetch origin main
git pull --rebase origin main
```

### [4] 수집

```bash
SEC_EDGAR_USER_AGENT="Signal Daily (parkjongkwan@users.noreply.github.com)" npx tsx scripts/collect.ts --vertical all --date $DATE
```

키 없는 소스는 skip된다(정상). 갭은 보고에 기록한다.

### [5] 에디션 작성

버티컬(`ai`, `bio`, `geo`, `markets`)별로 `data/editions-source/$DATE/<v>.jsonl`에서
`src/content/editions/$DATE/<v>.json`을 작성한다. `src/content.config.ts` 스키마를 준수하고, 편집
규칙([docs/editorial-guide.md](editorial-guide.md))을 따른다.

- 스토리 5~8 (얇은 날 최소 1, `summary`에 명시)
- `headline` 원문 그대로
- `tldr` 정확히 3
- 모든 본문 블록은 존재하는 source id 인용
- 스토리당 distinct source ≥2 (하드 게이트, 불가 시 제외/병합)
- `cluster`는 실제 추가 보도 링크
- 태그
- 정직한 `confidence`
- URL·수치·인용·출처 날조 금지
- bio/markets YMYL 조언 금지
- 영어

로컬 LLM 키가 없으면 `synth.ts` LLM 경로를 쓸 수 없어 운영자(에이전트)가 직접 작성하는 경로가
기본이다. 키를 설정한 경우 아래 명령 또는 `--input-json` 대안을 쓴다.

```bash
npx tsx scripts/synth.ts --date $DATE --vertical all
```

### [6] 검증

```bash
npx tsx scripts/validate.ts src/content/editions/$DATE/
```

통과할 때까지 수정한다.

### [7] 빌드

```bash
npm run build
```

그린을 확인한다.

### [8] 에디션 커밋(②)

`data/editions-source/$DATE` + `src/content/editions/$DATE`를 커밋한다. 예: `content: daily edition $DATE`

### [9] push

```bash
git push origin main
```

### [10] 배포

```bash
vercel deploy --prod --yes
```

### [11] 공개 확인

```bash
curl -s https://www.signaldaily.cloud
```

- "Signal Daily"·에디션 날짜 확인
- `/YYYY/MM/DD/`·스토리 페이지 200 확인
- `signalroom-mediio-net.vercel.app`은 SSO 보호(302) — 보호 설정 변경 금지

### [12] 보고

날짜, 버티컬별 스토리 수, 소스 갭, 검증 결과, 커밋 해시, 배포 URL.

## 3. 주의사항

- **UTC 날짜 겹침**: UTC 날짜 규칙 때문에 수동 발행 후 다음 아침 스케줄이 같은 UTC 날짜를 재생성할
  수 있다. 고정하려면 스케줄을 1회 일시정지한다.
- **미커밋 상태 push 금지**: Vercel git 연동이 프로덕션을 되돌릴 수 있다.
- **키 없는 소스**: skip 목록은 README 자격증명 표를 참조한다 —
  [README § What still needs credentials](../README.md#what-still-needs-credentials).
- **발행 게이트**: 위반 아이템은 예외 없이 미발행한다. 검증 실패 시 수정 → 재검증.
- **배포 보호 호스트**: `signalroom-mediio-net.vercel.app`은 SSO 보호(302)다 — 보호 설정을 변경하지
  않는다.

### 같은 날짜 2차 패스(병합) 규칙

하루 두 번 발행한다 — 저녁 패스가 새 UTC 날짜 에디션을 1차 생성하고, 다음 07:00 KST 스케줄이 같은
날짜에 병합한다. 같은 날짜 에디션이 이미 있으면 덮어쓰지 말고 병합한다: 기존 스토리를 유지하고
신규 스토리를 추가하며, 중복을 제거하고 총 스토리 수 1~8을 유지한 뒤 재검증한다.

## 4. 참고 실행 (2026-09-21)

2026-09-21 수동 발행 — 커밋 `6031eb4`(사이트·문서) / `fdf7cca`(에디션), 22 스토리(AI 5 / Bio 5 /
Geo 6 / Markets 6).
