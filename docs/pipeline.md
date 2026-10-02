# Signal Daily pipeline

Git-native daily edition pipeline, with a separate collection for independent Markdown articles.

```
collectors (4 automated categories) scripts/collectors/*.ts
        |
        v
scripts/collect.ts  --vertical <ai|bio|geo|markets|all> --date YYYY-MM-DD
        |
        +--> data/raw/{date}/{source}.jsonl          (gitignored, raw capture)
        |
        v
dedup (normalizeUrl + sha1 + simhash64)  scripts/lib/dedup.ts
        |
        +--> data/editions-source/{date}/{vertical}.jsonl   (committed)
        +--> data/editions-source/{date}/manifest.json      (committed health report)
        |
        v
scripts/synth.ts  --date ... --vertical ... [--provider ...] [--input-json ...]
        |        (LLM w/ scripts/prompts/{triage,synthesis,editor}.md,
        |         or agent-assisted --input-json path)
        v
src/content/editions/{date}/{vertical}.json      (en edition)
src/content/editions/{date}/{vertical}.ko.json   (ko edition)
        |
        v
scripts/prompts/editor.md + scripts/validate.ts
        |
        v
site build -> commit -> push -> Vercel production
        |
        v
active Paseo schedule
```

Independent Markdown articles live in `src/content/articles/` and use the separate `articles`
collection. They join category, search, archive, RSS and sitemap outputs but do not enter the edition
JSON merge flow. Their metadata contract is owned by `src/content.config.ts` and
`scripts/validate-article.ts`.

## Architecture

- **collect.ts** fans out one collector module per source with a small
  concurrency limiter (default 4). Each source failure is captured per source
  (`ok | empty | failed` + error string) in the manifest; a single failing
  source never aborts the run.
- **dedup.ts**: `normalizeUrl` canonicalizes URLs (strips `utm_*`, `fbclid`,
  `gclid`, `amp` params/paths, fragments, trailing slashes, `www.`), `sha1`
  URL hashes for exact dups, `simhash64(title)` + Hamming distance <= 3 for
  near-duplicate headlines.
- **store.ts**: JSONL + manifest IO under `data/`. `data/raw/**` and
  `data/cache/**` are gitignored; normalized vertical JSONLs and the manifest
  are committed so the pipeline state is reviewable in git.
- **synth.ts**: two paths. `--input-json` validates an agent/editor-authored
  edition JSON and writes it to `src/content/editions/`. Otherwise it calls an
  LLM provider (gemini | openai | anthropic | openrouter) using env keys. With
  no key configured it prints a clear message and exits 0 without writing.
  Verticals with zero collected items for the date are skipped without writing
  a file.
- **validate.ts** checks the edition schema and edition publish gates: >= 2 distinct sources per
  story, every body citation resolves to `sources[]`, exactly 3 `tldr` bullets, unique slug,
  `cluster` >= 1, non-empty headline and valid enums.
- **validate-article.ts** is the article metadata schema and CLI validation source. Article `draft`
  defaults to `true`; only `draft: false` articles enter public outputs. Independent personal
  reflection does not inherit edition-only `tldr`, `cluster`, two-source or every-block citation
  gates. Cite factual and historical claims and classic quotations, and distinguish the author's
  account from interpretation.

## Commands

```bash
npx tsx scripts/collect.ts --vertical ai --date 2026-09-20 --dry-run
npx tsx scripts/collect.ts --vertical all --date $(date -u +%F)
npx tsx scripts/synth.ts --date 2026-09-20 --vertical ai --provider gemini
npx tsx scripts/synth.ts --date 2026-09-20 --vertical ai --input-json draft.json
npx tsx scripts/validate.ts src/content/editions
npx tsx scripts/validate-article.ts src/content/articles
npm test
```

## Environment / secrets

| Var | Used for | Required? |
|-----|----------|-----------|
| `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` | synth LLM call | optional (skips without) |
| `SEC_EDGAR_USER_AGENT` | SEC EDGAR full-text search; e.g. `"Jane Doe jane@example.com"` | required for SEC (403 without) |
| `RELIEFWEB_APPNAME` | ReliefWeb API appname (pre-approved at apidoc.reliefweb.int) | required for reliefweb |
| `GITHUB_TOKEN` | higher GitHub API rate limits | optional |
| `FRED_API_KEY` | FRED series updates | optional |
| `SIGNALROOM_USER_AGENT` | collector User-Agent | optional (default provided) |
| `SITE_URL` | base URL for canonical links, sitemap, RSS and OG tags | set in Vercel Production (`https://signaldaily.cloud`); unset falls back to the deployment URL |

Current production URL: `https://signaldaily.cloud` (custom domain; www
`www.signaldaily.cloud` 308-redirects to apex). `SITE_URL` is set in the Vercel
Production env, so canonicals, sitemap, RSS and OG URLs use the custom domain.

## Exclusions and licensing (why some sources are absent)

| Source | Status | Reason |
|--------|--------|--------|
| ACLED | **excluded** | commercial license required |
| Reddit | limited | non-commercial use only; metadata/headlines only |
| X (Twitter) API | excluded as primary | expensive/closed; secondary references only |
| YouTube search.list | not used | limited quota; channel RSS instead |
| GDELT | used | attribution required ("GDELT Project") in every use |
| arXiv / PubMed / bioRxiv abstracts | metadata only | abstracts are publisher-copyright; own summaries only |
| SEC EDGAR | used | public domain (17 U.S.C. sec. 105) |
| Wire (Reuters/AP/Bloomberg) | headline+link only | copyrighted; failing feeds dropped |

## Content rules

- Excerpts in `RawItem` are capped at 400 characters and never contain full
  article text.
- YMYL verticals (bio, markets) are no-advice: no investment or medical
  recommendations, uncertainty is labeled.
- Every published story needs >= 2 distinct sources and a citation set that
  fully resolves; the editor pass sets `confidence`.
- Daily volume follows the editorial quotas in
  [docs/editorial-guide.md](editorial-guide.md): a **12–24 stories/day band** and
  **3–6 per active vertical**, with equal per-vertical counts never forced.
- Quiet verticals are skipped, never padded: log `quiet: <vertical>` in the
  daily log or commit message (docs/editorial-guide.md §4-3).
- One core signal per day: a single cross-vertical lead whose `whyItMatters`
  names the connected verticals with supporting evidence
  (docs/editorial-guide.md §5).
- Source independence: the >= 2 distinct `source` values must come from
  different outlets; two labels on the same hostname do not count as independent
  sources (docs/editorial-guide.md §6-3).

## Active automation and standby workflows

Paseo is the active production runner. Its schedules run every day at **07:00 and 19:00
Asia/Seoul**. Each run collects the existing four automated categories (`ai`, `bio`, `geo`,
`markets`) in English and Korean, performs the editorial and schema checks, builds the site, commits
and pushes the checked editions, and runs `vercel deploy --prod --yes`. Runtime history confirms
these scheduled runs reach production. WISDOM and SOCIETY remain manual categories; the scheduled
collection targets are unchanged.

The `schedule:` triggers in `.github/workflows/collect.yml` and `publish.yml` are disabled. Their
`workflow_dispatch` entries are standby paths, separate from Paseo. A manually triggered GitHub
workflow may collect and commit draft data or editions; it is not the active production schedule.

For a user-requested manual edition feature, provide a merged edition JSON to
`scripts/synth.ts --input-json`. This path supports all six categories and chooses the English or
Korean output filename from the input `lang`. Mark each new feature story
`publication: 'manual'`. The input must already contain all existing stories. The writer refuses a
same-date replacement that omits an existing story or removes its manual publication marker; see the
preservation gate in [`scripts/synth.ts`](../scripts/synth.ts) for the exact behavior. Run the
edition validators and build before any requested publication. The single detailed manual procedure
is [docs/manual-publish.md](manual-publish.md).

Standalone articles use Markdown and are outside automatic edition collection and JSON merge. Use
`scripts/validate-article.ts` for their metadata check; the schema remains defined by
`src/content.config.ts` and `scripts/validate-article.ts`. See the manual procedure for write-only and
publication paths.
