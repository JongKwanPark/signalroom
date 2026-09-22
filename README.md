# Signal Daily

A public, no-login daily intelligence digest across four verticals — **AI**, **Bio & health**,
**Geopolitics & security** and **Markets & macro**. Every item says what moved, why it matters and
where it came from, with primary sources cited inline. Drafted with AI assistance, reviewed by an
editor, no tracking and no advice.

- Latest edition: the home page (`/`) is the day's cover.
- Archive: `/archive`, per-day editions at `/<yyyy>/<mm>/<dd>`, per-vertical feeds at `/<vertical>`.
- Machine-readable: `/rss.xml`, `/llms.txt`, `/sitemap-index.xml`.

## Architecture

- **Astro 7, fully static, deployed on Vercel.** No server or runtime data fetch; every page is
  built ahead of time.
- **Git-native pipeline** in `scripts/`: `collect.ts` fans out one collector module per source,
  `lib/dedup.ts` removes exact and near-duplicate items, `synth.ts` drafts an edition per vertical
  (LLM call or agent-authored `--input-json`), `validate.ts` enforces the publish gates. Raw
  captures stay gitignored; normalized JSONL plus a per-day manifest are committed so pipeline
  state is reviewable in Git.
- **Frozen content schema** in `src/content.config.ts`. Editions live at
  `src/content/editions/<date>/<vertical>.json`; a build fails if a story cites a source that is
  not defined or breaks any schema rule.
- **Build-time OG images.** `npm run build` runs `scripts/og.mjs` after `astro build` and emits
  1200×630 PNGs (`satori` + `@resvg/resvg-js`) to `dist/og/site.png` and `dist/og/<slug>.png`;
  `SeoHead` points `og:image` / `twitter:image` at those absolute URLs.
- **Design rules** — off-black canvas, 1px hairlines, mono metadata and four hue-only vertical
  accents — are documented in [docs/design-system.md](docs/design-system.md).

## Local commands

```bash
npm install
npm run dev              # Astro dev server
npm run build            # static build + PNG OG cards -> dist/
npm run preview          # serve the production build
npm run check            # astro check (types + Astro diagnostics)
npm test                 # node --test (dedup + publish validation)
npm run pipeline:collect -- --vertical all --date "$(date -u +%F)"
npm run pipeline:synth   -- --date 2026-09-20 --vertical ai
npx tsx scripts/validate.ts src/content/editions
```

Node 24 (see `.nvmrc`). Copy `.env.example` to `.env` for pipeline runs.

## Automation

One daily job, two possible runners:

1. **paseo schedules (active)** — run twice daily at **07:00 and 19:00 KST**: collect → synthesize →
   validate → commit drafts.
2. **GitHub Actions (standby)** — `.github/workflows/collect.yml` and `publish.yml`. Their
   `schedule:` triggers are intentionally **commented out** so they cannot double-run alongside
   the paseo schedule; `workflow_dispatch` remains. Re-enable the crons once the LLM API keys are
   configured as repository secrets and the paseo schedule is retired. See
   [docs/pipeline.md](docs/pipeline.md).

Editions committed by automation are **drafts** until the human approval gate in
docs/pipeline.md is passed.

Emergency manual publishing outside the 07:00/19:00 KST schedules is documented in
[docs/manual-publish.md](docs/manual-publish.md).

## Data sources and licensing

Collectors cover Hacker News, Reddit, arXiv, GitHub, YouTube channel RSS, PubMed,
bioRxiv/medRxiv, openFDA, ClinicalTrials.gov, GDELT, ReliefWeb, ISW, wire feeds, Polymarket,
SEC EDGAR, FRED, journal RSS and market data. Rules that shape what is stored:

- Excerpts are capped at 400 characters; full article text is never stored.
- Scholarly abstracts (arXiv / PubMed / bioRxiv) are metadata only — summaries are our own.
- Wire copy is headline + link only; GDELT use carries the required "GDELT Project" attribution.
- Sources that require commercial licenses or closed APIs (ACLED, X/Twitter as a primary source)
  are excluded.
- The full source-by-source table and rationale live in
  [docs/pipeline.md](docs/pipeline.md#exclusions-and-licensing-why-some-sources-are-absent).

## Editorial standards

- **AI-assisted draft, human editor review.** No item publishes unreviewed; automation only
  commits drafts.
- **Primary sources cited inline.** Every paragraph maps to numbered citations that resolve to the
  story's source list; the build enforces it.
- **No advice.** Bio and markets items never give medical or investment recommendations, and
  uncertainty is labeled.
- **Confidence labels.** Each story carries `high` / `medium` / `low` confidence describing the
  state of the evidence, not the importance of the story. Full disclosure on `/standards`.
- **Daily quotas and quiet days.** [docs/editorial-guide.md](docs/editorial-guide.md) is the
  editorial source of truth: a 12–24 stories/day band (3–6 per active vertical, equal counts never
  forced), quiet verticals skipped and logged as `quiet: <vertical>` instead of padded, and one
  cross-vertical core signal per day.

## What still needs credentials

| Item | Env / place | Effect when missing |
| --- | --- | --- |
| LLM provider key | `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` (+ `LLM_PROVIDER`) | `synth.ts` skips cleanly; editions must be authored via `--input-json` |
| SEC EDGAR user agent | `SEC_EDGAR_USER_AGENT` (e.g. `"Name email@example.com"`) | SEC full-text search returns 403 |
| ReliefWeb appname | `RELIEFWEB_APPNAME` (pre-approved at apidoc.reliefweb.int) | ReliefWeb collector is skipped |
| FRED key | `FRED_API_KEY` | FRED series updates are skipped |
| Custom domain | `SITE_URL` on Vercel (Production) | Live at `https://www.signaldaily.cloud`; canonicals, sitemap, RSS and OG URLs use that domain (apex `signaldaily.cloud` 308-redirects to `www`) |
| Analytics | none (by design) | Zero third-party scripts; add only a privacy-first option if ever needed |

GitHub Actions also accept `GITHUB_TOKEN` for higher API rate limits.
