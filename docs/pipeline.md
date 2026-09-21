# Signal Daily pipeline

Git-native daily digest: collect -> dedup -> synthesize -> validate -> publish.

```
collectors (17 sources)          scripts/collectors/*.ts
        |
        v
scripts/collect.ts  --vertical <v|all> --date YYYY-MM-DD [--dry-run] [--limit N]
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
src/content/editions/{date}/{vertical}.json      (draft editions)
        |
        v
scripts/validate.ts        (schema mirror + publish gates; exit != 0 on violation)
        |
        v
automation commit (paseo schedule; GitHub Action when re-enabled)
        |
        v
human approval gate  ->  site publish
```

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
- **validate.ts** hand-rolls the exact checks of `src/content.config.ts` plus
  publish gates: >= 2 distinct sources per story, every body citation resolves
  to `sources[]`, exactly 3 tldr bullets, unique slug, cluster >= 1, headline
  non-empty, valid enums.

## Commands

```bash
npx tsx scripts/collect.ts --vertical ai --date 2026-09-20 --dry-run
npx tsx scripts/collect.ts --vertical all --date $(date -u +%F)
npx tsx scripts/synth.ts --date 2026-09-20 --vertical ai --provider gemini
npx tsx scripts/synth.ts --date 2026-09-20 --vertical ai --input-json draft.json
npx tsx scripts/validate.ts src/content/editions
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
| `SITE_URL` | base URL for canonical links, sitemap, RSS and OG tags | optional (unset uses the deployment URL) |

Current production URL: `https://signalroom-nu.vercel.app` (the Vercel deployment
alias, live and public). The custom domain `signaldaily.net` is not connected yet
(no DNS), so `SITE_URL` should stay unset until it is.

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

## Automation

The daily job runs from a **paseo schedule at 07:00 KST**, which collects,
synthesizes and commits drafts to this repo.

The GitHub Actions `schedule:` triggers in `collect.yml` and `publish.yml` are
**commented out on purpose**: both paths run the same daily job, so leaving the
crons on would double-run collection and drafting. Run either workflow manually
with `workflow_dispatch` if needed.

**Re-enable the schedules once the LLM provider key (and the other collector
keys below) are configured as repository secrets** — and retire the paseo
schedule at the same time so the two automation paths never run together.

## Hybrid publishing flow

1. `collect.yml` (`workflow_dispatch`; cron disabled) refreshes raw/normalized
   data and drafts.
2. `synth.ts` auto-drafts an edition JSON per vertical (or an agent edits with
   `--input-json`).
3. The **AI editor pass** (`scripts/prompts/editor.md`) checks duplicates,
   unsupported claims, citation integrity, the day's core signal (grounded
   cross-vertical links), source independence by hostname, and quiet-vertical
   logging, then sets `confidence`.
4. **Approval gate**: a human reviews the draft commit before the Astro site
   build/publish picks it up. Auto-committed editions are drafts; only
   approved editions are published.
5. `publish.yml` (`workflow_dispatch`; cron disabled) runs collect -> synth ->
   validate, commits drafts only when changed (`git diff --quiet` guard), and
   includes a keepalive empty commit so the 60-day GitHub inactivity rule never
   disables the schedules once they are re-enabled.

## Monthly cost estimate

- Data collection: all sources are free APIs; when the schedules are enabled,
  ~3,000 CI runs/month at ~2 min CPU each is within free-tier GitHub Actions
  for public repos (or ~$0-$3 on private-repo minutes). Runs are currently
  driven by the paseo schedule and `workflow_dispatch`, so CI cost is ~$0.
- Synthesis: one LLM call per vertical per day at ~6-10k input + ~4k output
  tokens = ~40k tokens/day x 4 verticals ~ 4.8M tokens/month, roughly
  **$1-5/month** with mid-tier models (Flash/4o-mini class), <$10 with premium
  models. Empty-key runs are free.
