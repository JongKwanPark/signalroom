# 시그널 데일리 수동 발행 런북

> 이 문서는 사용자가 요청한 수동 작성·발행의 절차를 소유한다. 정기 자동 운영은 [파이프라인](pipeline.md), 편집 판단은 [편집 가이드](editorial-guide.md)를 따른다.

## 1. 현재 발행 경로

- **정기 운영**: 활성 Paseo 스케줄이 매일 07:00·19:00 Asia/Seoul에 실행된다. AI·BIO·GEO·MARKETS를 한·영으로 수집·작성하고 편집·스키마 검증과 빌드를 거쳐 커밋·push 후 Vercel 프로덕션에 배포한다. WISDOM·SOCIETY는 수동 카테고리다.
- **GitHub Actions 대기 경로**: `.github/workflows/collect.yml`과 `publish.yml`의 cron은 꺼져 있다. `workflow_dispatch`는 대기 경로로 남아 있으며, 활성 Paseo 프로덕션 스케줄과 별개다.
- **에디션 특집**: 사용자 링크·주제·의견을 바탕으로 날짜별 에디션 JSON에 새 스토리를 추가한다. 기존 정기 스토리와 기존 특집을 보존하고 새 스토리는 `publication: 'manual'`로 표시한다.
- **독립 기사**: 긴 에세이·분석 등은 `src/content/articles/`의 Markdown으로 작성한다. 자동 수집 및 날짜별 에디션 JSON 병합과 분리된다.

사용자가 글 작성만 요청하면 아래 로컬 검증·빌드 후 멈춘다. 커밋·push·프로덕션 배포는 사용자가 발행을 요청한 경우에만 이어서 수행한다. 별도 승인 절차를 추가하지 않는다.

## 2. 날짜별 에디션 특집

### 2-0. 작업 기준 동기화

발행을 요청받은 작업은 기사 파일을 수정하기 전에 원격 기준과 작업 트리를 확인한다. 무관한 미커밋 변경을 임의로 stash·삭제하거나 배포에 포함하지 않는다. Vercel CLI는 현재 작업 트리를 빌드하므로 요청된 변경만 배포 입력에 들어가는지 확인한다. 배포 명령은 [§5](#5-프로덕션-배포)를 따른다.

```bash
git status --short
git fetch origin main
# 작업 트리가 정리된 경우 기사 작성 전에 동기화
git pull --rebase origin main
```

### 2-1. 출처 확인과 작성

1. 에디션 날짜를 UTC로 정한다.

   ```bash
   DATE=$(date -u +%F)
   ```

2. 대상 버티컬과 날짜의 영어·한국어 JSON이 이미 있는지 확인한다. 버티컬은 `ai`, `bio`, `geo`, `markets`, `wisdom`, `society` 중 하나다.
3. 사용자가 제공한 링크·주제에서 확인 가능한 1차 출처를 열어 사실·수치·고전 인용을 검증한다. 사실과 사용자 또는 저자의 의견을 구분하고, 의견을 출처의 결론처럼 쓰지 않는다.
4. 에디션 특집은 기존 규약대로 영어판을 작성하고 의미가 일치하는 한국어판을 만든다. 기존 특집을 다시 쓸 때는 해당 스토리의 본문을 임의로 바꾸지 않는다.
5. 기존 날짜 파일이 있으면 그 파일의 스토리를 포함해 입력 JSON을 먼저 병합한다. 새 스토리마다 `publication: 'manual'`을 명시한다. 총 8편을 넘는다면 신규 중복을 기존 스토리에 통합하거나 새로 추가할 기사 수를 조정한다. 이미 발행한 스토리는 유지한다. 에디션 한도를 넘는 특집은 §3의 독립 Markdown 글로 작성할 수 있다.

### 2-2. 병합 파일 쓰기

입력은 `date`, `vertical`, `lang`, 제목·요약, 기존 스토리를 포함한 완성된 에디션 JSON이어야 한다. `scripts/synth.ts --input-json`은 여섯 카테고리를 받으며 입력의 `lang`에 따라 `.json` 또는 `.ko.json` 파일명을 선택한다. 실행 전에 해당 언어의 기존 스토리와 수동 발행 표시를 입력에 반영한다.

```bash
npx tsx scripts/synth.ts --vertical all --input-json "$INPUT"
```

같은 날짜·버티컬·언어의 기존 스토리나 `publication: 'manual'` 표시 보존 검사는 [`scripts/synth.ts`](../scripts/synth.ts)의 단일 구현을 따른다. 런북에서 검사 알고리즘을 복제하지 않는다. 검사가 거부하면 입력을 현재 에디션과 다시 병합한 뒤 재실행한다.

### 2-3. 검증과 로컬 빌드

```bash
npx tsx scripts/validate.ts "src/content/editions/$DATE"
npm run build
```

한·영 쌍을 함께 썼다면 각 한국어 파일에 번역 검증도 실행한다. 스키마·출처·인용 검증이 모두 통과하고 빌드가 성공해야 완료다.

```bash
npx tsx scripts/validate-i18n.ts "src/content/editions/$DATE/<vertical>.ko.json" --en "src/content/editions/$DATE/<vertical>.json"
```

규약과 편집 기준은 [편집 가이드](editorial-guide.md)를 따른다.

### 2-4. 발행 요청이 있는 경우

글 작성만 요청했다면 여기서 멈추고 로컬 파일 경로와 검증 결과를 보고한다. 발행을 요청받은 경우에는 변경 파일을 확인하고 해당 날짜 에디션만 커밋·push한 다음 프로덕션에 배포한다. 작성 중 원격에 새 변경이 생겼다면 요청한 변경을 보존해 병합하고 검증·빌드를 다시 실행한다. 미커밋 기사 파일 위에서 무조건 `git pull --rebase`를 실행하지 않는다.

```bash
git fetch origin main
git status --short
# 검토 후 요청된 날짜 에디션 파일만 stage

git commit -m "content: add manual feature to $DATE <vertical>"
git push origin main
# 이어서 §5의 prebuilt 배포를 실행한다
```

배포 후 `https://signaldaily.cloud/<YYYY>/<MM>/<DD>/`와 해당 스토리의 한·영 URL이 공개되는지 확인한다. 보호된 `signalroom-mediio-net.vercel.app` 호스트의 SSO 설정은 변경하지 않는다.

## 3. 독립 Markdown 기사

1. 파일을 `src/content/articles/` 아래에 만들고 frontmatter에는 `slug`, `title`, `description`, `category`, `format`, `author`, `lang`, `publishedAt`을 지정한다. `category`는 `ai`, `bio`, `geo`, `markets`, `wisdom`, `society` 중 하나이며 `format`은 `essay`, `feature`, `analysis` 중 하나다. 태그, `updatedAt`, `translationKey`, `sources`는 필요에 따라 쓴다.
2. 기사는 원문 언어만으로 작성할 수 있다. 번역본을 만들면 같은 `translationKey`로 연결한다. 초안은 `draft` 기본값 `true`를 유지하고 공개할 글은 `draft: false`로 표시한다.
3. `scripts/validate-article.ts`로 메타데이터를 확인하고 로컬 빌드를 실행한다.

   ```bash
   npx tsx scripts/validate-article.ts src/content/articles/<file>.md
   npm run build
   ```

4. 개인 성찰에는 에디션 뉴스용 2개 출처, 3개 요약, 클러스터, 모든 문단 인용을 요구하지 않는다. 사실·역사 설명과 고전의 직접 인용에는 출처를 제시하고 저자의 경험·해석과 확인된 사실을 독자가 구별할 수 있게 쓴다. 상세 편집 기준은 [편집 가이드](editorial-guide.md)를 따른다.
5. 작성만 요청했다면 검증·빌드 뒤 멈춘다. 발행 요청을 받은 경우에는 §2-0의 작업 전 동기화와 §2-4의 발행 절차를 적용하되, 커밋 대상은 해당 Markdown 파일로 한정한다. 독립 기사는 날짜별 에디션 JSON에 병합하지 않는다.

## 4. 운영 결과 보고

수동 작업이 끝나면 대상 날짜·카테고리·언어·콘텐츠 경로, 검증과 빌드 결과를 보고한다. 실제 발행을 요청받아 수행한 경우에만 커밋 해시, 배포 결과와 공개 URL도 적는다.

## 5. 프로덕션 배포

프로덕션 배포는 항상 로컬에서 빌드한 결과물을 올리는 prebuilt 방식으로 한다. Vercel 원격 빌드는 빌드 시간이 과금되므로 `vercel deploy --prod`처럼 원격 빌드를 일으키는 명령은 쓰지 않는다. 수동 발행, 디자인·코드 변경, 정기 운영 모두 같은 절차를 따른다.

```bash
vercel pull --yes --environment=production
# Sensitive 변수(SITE_URL)는 값 대신 "[SENSITIVE]"로 내려와 빌드가 "Invalid URL"로 실패한다.
# 빌드에 필요한 값만 남기고 함께 내려온 API 키는 로컬에 두지 않는다.
printf 'SITE_URL=https://signaldaily.cloud\n' > .vercel/.env.production.local
vercel build --prod
vercel deploy --prebuilt --prod --yes
rm -f .vercel/.env.production.local
```

- `vercel build --prod`는 `vercel.json`의 `buildCommand`(`npm run build` = Astro 빌드 + OG 이미지)를 로컬에서 실행하고 `.vercel/output/`을 만든다. `npm run deploy:vercel`도 같은 build→prebuilt 순서를 실행하지만 위의 pull·env 단계는 먼저 해 둬야 한다.
- 빌드 입력은 작업 트리다. 커밋되지 않은 무관한 변경(다른 작업의 수정 파일)이 있으면 그 트리에서 빌드하지 않고, 커밋된 HEAD를 임시 경로로 꺼내 빌드·배포한다. `git archive HEAD | tar -x -C <tmp>`로 꺼낸 다음 `.vercel/project.json`을 복사하고 `node_modules`를 링크한 뒤 위 명령을 그 경로에서 실행한다.
- 배포 로그에 `Installing dependencies`나 `astro build` 같은 원격 빌드 출력이 없고 `readyState: READY`, `Aliased https://signaldaily.cloud`가 나오면 정상이다.

