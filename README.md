# Signal Daily

A public, no-login publication across six categories — **AI**, **Bio & health**,
**Geopolitics & security**, **Markets & macro**, **WISDOM** and **SOCIETY**. Scheduled news editions
cover the first four; operators can also publish features and independent Markdown articles in all
six. See [docs/manual-publish.md](docs/manual-publish.md) for the current operation paths.

- Latest edition: the home page (`/`) is the day's cover.
- Archive: `/archive`, per-day editions at `/<yyyy>/<mm>/<dd>`, per-vertical feeds at `/<vertical>`.
- Machine-readable: `/rss.xml`, `/llms.txt`, `/sitemap-index.xml`.
- Independent articles use `/{lang}/story/{slug}` and join category pages, search, archives and RSS.

## Architecture

- **Astro 7, fully static, deployed on Vercel.** No server or runtime data fetch; every page is
  built ahead of time.
- **Git-native pipeline** in `scripts/`: `collect.ts` fans out one collector module per source,
  `lib/dedup.ts` removes exact and near-duplicate items, `synth.ts` drafts an edition per vertical
  (LLM call or agent-authored `--input-json`), `validate.ts` enforces the publish gates. Raw
  captures stay gitignored; normalized JSONL plus a per-day manifest are committed so pipeline
  state is reviewable in Git.
- **Content schemas**: `src/content.config.ts` defines editions and the article collection;
  standalone article metadata and its CLI validation live in `scripts/validate-article.ts`.
  Edition JSON remains at `src/content/editions/<date>/`; independent Markdown is under
  `src/content/articles/`. `src/lib/categories.ts` owns the six site categories and four automated
  collection targets.
- **Build-time OG images.** `npm run build` runs `scripts/og.mjs` after `astro build` and emits
  1200×630 PNGs (`satori` + `@resvg/resvg-js`) to `dist/og/site.png` and `dist/og/<slug>.png`;
  `SeoHead` points `og:image` / `twitter:image` at those absolute URLs.
- **Design rules** — off-black canvas, 1px hairlines, mono metadata and six category accents
  — are documented in [docs/design-system.md](docs/design-system.md).

## Local commands

```bash
npm install
npm run dev              # Astro dev server
npm run build            # static build + PNG OG cards -> dist/
npm run preview          # serve the production build
npm run check            # astro check (types + Astro diagnostics)
npm test                 # node --test (dedup + publish validation)
npm run pipeline:collect -- --vertical all --date "$(TZ=Asia/Seoul date +%F)"
npm run pipeline:synth   -- --date 2026-09-20 --vertical ai
npx tsx scripts/validate.ts src/content/editions
```

Node 24 (see `.nvmrc`). Copy `.env.example` to `.env` for pipeline runs.

## Automation

The active Paseo schedules run at **07:00 and 19:00 Asia/Seoul**. The edition date is the
Asia/Seoul calendar date, so the 07:00 run opens that day's edition and the 19:00 run merges into it.
Each run collects and drafts
English and Korean editions for `ai`, `bio`, `geo` and `markets`, runs the editorial and schema
checks, builds the site, commits and pushes the checked output, then deploys to Vercel production.
The two new site categories are manual-only; the automated collection target remains those four.

GitHub Actions in `.github/workflows/collect.yml` and `publish.yml` are standby `workflow_dispatch`
paths. Their cron triggers are disabled; manual workflow runs are separate from the active Paseo
production schedule and commit drafts rather than serving as its production publishing path.
Pipeline details are in [docs/pipeline.md](docs/pipeline.md); user-requested writing and publication
are in [docs/manual-publish.md](docs/manual-publish.md).

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

- **Scheduled editions pass editorial and schema checks before automated production publishing.**
- **News claims are sourced.** Edition body blocks resolve numbered citations to the story's
  sources. Independent articles cite factual and historical claims and direct quotations, while
  identifying the author's interpretation; personal reflection does not inherit newsroom-only
  citation, summary or cluster requirements.
- **No advice.** Bio and markets items never give medical or investment recommendations, and
  uncertainty is labeled.
- **Confidence labels.** Each news story carries `high` / `medium` / `low` confidence describing the
  state of the evidence, not the importance of the story. Full disclosure on `/standards`.
- **Edition quotas and quiet days.** [docs/editorial-guide.md](docs/editorial-guide.md) is the
  editorial source of truth for the four scheduled verticals: a 12–24 stories/day band (3–6 per
  active vertical, equal counts never forced), quiet verticals skipped and logged as
  `quiet: <vertical>` instead of padded, and one cross-vertical core signal per day.

## What still needs credentials

| Item | Env / place | Effect when missing |
| --- | --- | --- |
| LLM provider key | `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` (+ `LLM_PROVIDER`) | `synth.ts` skips cleanly; editions must be authored via `--input-json` |
| SEC EDGAR user agent | `SEC_EDGAR_USER_AGENT` (e.g. `"Name email@example.com"`) | SEC full-text search returns 403 |
| ReliefWeb appname | `RELIEFWEB_APPNAME` (pre-approved at apidoc.reliefweb.int) | ReliefWeb collector is skipped |
| FRED key | `FRED_API_KEY` | FRED series updates are skipped |
| Custom domain | `SITE_URL` on Vercel (Production) | Live at `https://signaldaily.cloud`; canonicals, sitemap, RSS and OG URLs use that domain (www `www.signaldaily.cloud` 308-redirects to apex) |
| Analytics | none (by design) | Zero third-party scripts; add only a privacy-first option if ever needed |

GitHub Actions also accept `GITHUB_TOKEN` for higher API rate limits.
