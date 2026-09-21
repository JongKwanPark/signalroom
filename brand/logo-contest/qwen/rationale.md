# Signal Daily — 로고 시안 (qwen)

## 컨셉 — "The letter is the wave"

심볼은 알파벳 **S를 신호 파형 하나 그 자체로** 그린다. 한 주기의 사인 파를 세로로 세우면
정확히 S가 된다 — 브랜드 이니셜과 "하루를 관통하는 신호 하나의 라인"이 같은 형태다. 기하학은
24유닛 그리드 위 점대칭 큐비크 두 개(상부 훅: (16.5,5)→(12,12), 하부 훅: (12,12)→(7.5,19))에
두께 절반 1.6의 오프셋을 수치 계산해 닫힌 필 패스로 만들었다(stroke 없음, 변형 불변).
끝단은 버트 캡(직각 절단) — 소음의 지그재그도, 과장된 라운드도 아닌, 필터를 통과한 단일
연속선. "신호 vs 소음"을 묘사가 아니라 **생략 그 자체로** 표현한다: 이 심볼에는 소음이 없다.

워드마크는 "Signal" Inter SemiBold(--text) + "Daily" Inter Regular(--muted)의 대소문자 혼용.
무게와 명도로 어휘를 분할한다 — 시그널은 또렷하게, 데일리(하루치 잡음의 덩어리)는 한 톤 낮게.
헤더의 `.sr-wordmark`이 proportional 스택을 쓰는 원칙(§3: 모노는 메타데이터 전용)에 따라
모노가 아닌 그로테스크를 선택했다. 기존 파비콘의 4-바를 계승하는 보조 컨셉도 검토했으나
16px에서 4개의 분리된 바가 뭉개져 기각(강제 계승보다 단독 서명이 유리).

## 디자인 시스템과의 관계

- `--radius: 0` — 타일도, 워드마크도, 파형 끝단도 직각. 라운드·그라디언트·섀도 0.
- 심볼은 특정 버티컬을 편들지 않는다: 웨이브는 하드코딩 hue가 아니라 `--text`이고, 프리뷰의
  ACCENT SLOT 패널에서 `--accent` 슬롯으로 4 hues가 그대로 자리에 앉는 것을 보여준다.
- 타일의 1px 하이라인(border)은 `--hairline-strong` 실측값 rgba(255,255,255,.16) — 마크를
  칩(사각 + 하이라인)과 같은 구조로 읽히게 해 헤더·배지 크롬과 혈통을 같이한다.
- dark-first 정본: `logo-primary.svg`는 다크 캔버스 기준(사이트 기본). 라이트/리버스 요구는
  `logo-mono.svg`(currentColor 노크아웃)가 담당 — 두 캔버스 모두에서 형태가 유지된다.

## 사용 색 토큰 (docs/design-system.md §2)

| 요소 | 토큰 | 값 |
| --- | --- | --- |
| 타일 필 | `--canvas`(dark) | `#0a0d12` |
| 파형 / "Signal" | `--text`(dark) | `#e8ecf1` |
| "Daily" | `--muted`(dark) | `#9aa4b2` |
| 타일 하이라인 | `--hairline-strong`(dark) | `rgba(255,255,255,.16)` |
| mono 파일 | 단일 `currentColor` — 라이트 시안에서는 `--text` `#10151c`로 렌더(프리뷰 2·4단) |
| 액센트 데모(파일 아님) | AI `#4cd1ee` · BIO `#7fd497` · GEO `#edb161` · MARKETS `#c3aeff` |

## 16px 파비콘

- 정사각 viewBox `0 0 24 24`, 실(實)타일 + 노크아웃/필 웨이브 2가지 모두 16px에서 한 덩어리
  실루엣. 선 두께 3.2/24u → 16px에서 약 2.1px로 씬-아웃되지 않는다.
- 파비콘으로 쓸 때는 타일 하이라인을 생략해도 형태가 동일(α .16은 16px에서 사실상 무의미).
  `logo-mark.svg`는 유지 — 24px+ 칩 사이즈에서는 하이라인이 캔버스 동색 문제를 해결.
- 라이트 배경 탭바에서는 `logo-mono.svg`의 노크아웃 방식(타일=currentColor, 웨이브=배경 노출)이
  배경색과 자동 동조.

## 워드마크 구현 한계 보고

`<text>` 미사용 — 리포 번들 폰트 `src/assets/fonts/Inter-{SemiBold,Regular}.ttf`를
satori(OG 카드 파이프라인과 동일)로 아웃라인화해 패스로 내장(폰트 의존성 0, 크로스환경 렌더
확정). 좌표는 satori 출력 그대로이며 생성 스크립트 `make-logos.mjs`로 재현 가능.
단, Inter는 사이트 본문 폰트(system stack)와 동일 면이 아니라 **브리지 선택**이다 —
SF Pro/Segoe UI 계열의 humanist grotesque와 인접하지만 별개의 골테스크이며, 최종 확정 시
타입 페이스 리터칭(자폭 -0.015em, baseline 광학 보정 +cap-center align)은 브랜드 폰트
선정 후 한 번 더 돌리는 것이 맞다.

## 파일

| 파일 | 내용 |
| --- | --- |
| `logo-primary.svg` | 122.7×24 가로 락업 (다크 캔버스 정본) |
| `logo-mark.svg` | 24×24 심볼 단독 (타일+하이라인+웨이브, 순수 패스 3개) |
| `logo-mono.svg` | 단일 currentColor — 노크아웃 타일 + 워드마크 (라이트/리버스용) |
| `preview.png` | 4개 패널 렌더: primary(dark), mono(light), 마크 96/32/24/16px, 액센트 슬롯 |
| `make-logos.mjs` | 전 파일 생성기(재현용) — `node brand/logo-contest/qwen/make-logos.mjs` |
