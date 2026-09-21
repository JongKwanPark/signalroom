# Signal Daily — Logo 시안 (mine)

## 1. 컨셉 — "One Clean Pulse"

심볼은 캔버스 타일 위에 한 주기의 **디지털 펄스**(스퀘어 웨이브)만 남긴다: 낮게 깔린
베이스라인 → 상승 엣지 → 짧은 하이 구간 → 하강 엣지 → 다시 베이스라인. Signal Daily의
편집 원칙("신호 vs 소음")을 형태로 옮겨, 잡음을 걷어낸 하루의 신호 하나만 남긴 모습이다.
곡선 없이 직각만 쓰는 스퀘어 펄스는 "기계가 보낸 신호"라는 제품 성격과 맞고, 어떤 크기에서도
한 덩어리 실루엣으로 남는다.

워드마크는 JetBrains Mono Regular · 대문자 · 0.14em 트래킹. 현재 사이트 헤더 워드마크와
OG 카드 마스트헤드가 쓰는 모노 대문자 크롬을 계승해 리브랜딩(Signal Room → Signal Daily)의
연속성을 유지했다. **아웃라인 패스로 변환**해 폰트 의존성이 0이다(§4 참조).

(보조 컨셉, 미채택: 기존 4-bar 파비콘을 계승해 네 개 바 높이 자체를 파형으로 만드는 안 —
16px에서 바코드처럼 뭉개져 탈락.)

## 2. 디자인 시스템과의 관계

- `--radius: 0` — 스퀘어 캡/마이터 조인. 라운드·그라디언트·섀도 없음.
- 구조는 도형 하나뿐. 하이라인·장식 추가 없음 (principle 1: Signal over decoration).
- 브랜드 마크는 특정 버티컬을 편들지 않는다: 펄스는 하드코딩 hex가 아니라 **`--accent`
  슬롯을 상속**하는 설계이고, 프리뷰 하단에서 같은 심볼이 네 버티컬 hue로 도는 것을 보여준다.
- 네 버티컬을 색 바로 넣지 않은 이유: 16px에서 네 색이 뭉개지고, 마크는 범례(legend)가
  아니라 서명(signature)이어야 하기 때문. 버티컬 hue는 UI 칩과 본 프리뷰가 담당한다.

### 사용한 색 토큰

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--canvas` | `#0a0d12` | 심볼 타일 배경 |
| `--accent-ai` | `#4cd1ee` | 펄스 기본 색 (canvas 대비 10.81:1, AAA — design-system §2) |
| `--text` | `#e8ecf1` | 워드마크 (canvas 대비 16.40:1, AAA) |
| `--muted` | `#9aa4b2` | 프리뷰 라벨 |
| `--accent-bio/geo/markets` | `#7fd497` / `#edb161` / `#c3aeff` | 상속 데모(네 버티컬) |

프리뷰 패널 배경은 `--surface-1 #0e1218`, 라이트 패널은 라이트 `--canvas #f6f7f9`를 썼다.

## 3. 16px 파비콘 고려

- 32u 그리드에 **4u 스트로크** → 16px에서 정확히 2px. 모든 좌표가 짝수라 16·32px에서
  픽셀 크리스프(안티에일리어싱 없이 또렷).
- 요소는 타일 + 펄스, 단 2개. 곡선·디테일이 사라져도 펄스 실루엣이 남는다.
- 프리뷰 FAVICON 줄은 16/24/32/48px **실픽셀** 렌더이며, 라이트/다크 크롬 양쪽에서 확인했다.
  타일이 항상 대비를 보장하므로 라이트 탭바에서도, `#2b2f36` 다크 탭바에서도 읽힌다.

## 4. 폰트 한계 보고 (요구사항)

- 워드마크는 `<text>`가 아니라 **패스 아웃라인**이다. 폰트 설치 여부와 무관하게 모든
  렌더러(브라우저·resvg·인쇄)에서 동일하게 나온다. 소스는 레포에 이미 있는
  `src/assets/fonts/JetBrainsMono-Regular.ttf`(OFL) — 새 폰트를 추가하지 않았다.
- 만약 런타임 `<text>`로 유지해야 한다면 폰트 스택을 명시해야 한다:
  `font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: .14em; text-transform: uppercase;`
  한계: JetBrains Mono가 없는 환경에서는 폴백 폭·트래킹이 달라져 락업 비율과 자간이
  흔들린다. 그래서 패스 아웃라인을 기본으로 제출한다.

## 5. 파일 및 검증

| 파일 | 내용 |
| --- | --- |
| `logo-primary.svg` | 심볼 + "SIGNAL DAILY" 가로 락업 (viewBox 211×40, 다크 우선) |
| `logo-mark.svg` | 심볼 단독 (viewBox 32×32, 파비콘용) |
| `logo-mono.svg` | 단색 락업 (`currentColor`, 타일·배경 없음 → 라이트 배경·1도 인쇄용) |
| `preview.png` | 세 SVG 실렌더 프리뷰 1440×1010 (@resvg/resvg-js, og.mjs와 동일 스택) |

- `logo-mono.svg`는 인라인 임베딩 시 주변 `color`를 상속하고, `<img>`로 단독 사용하면
  SVG 기본값(black)으로 그려져 라이트 배경에 적합하다. 다크 배경에서는 `color`만 지정하면 된다.
- 검증: 세 SVG 모두 resvg 렌더 성공, `preview.png` 생성 성공(실픽셀 파비콘 포함).
  프로덕션 파일·설정·의존성은 수정하지 않았다.
