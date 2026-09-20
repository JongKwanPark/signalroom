// Collector registry: one module per source. Added to scripts/collect.ts via
// explicit imports (no dynamic fs scanning for clarity).
import type { Collector } from "../lib/types.ts";
import { hackernews } from "./hackernews.ts";
import { reddit } from "./reddit.ts";
import { arxiv } from "./arxiv.ts";
import { github } from "./github.ts";
import { youtube } from "./youtube.ts";
import { pubmed } from "./pubmed.ts";
import { biorxiv, medrxiv } from "./biorxiv.ts";
import { openfda } from "./openfda.ts";
import { clinicaltrials } from "./clinicaltrials.ts";
import { gdelt } from "./gdelt.ts";
import { reliefweb } from "./reliefweb.ts";
import { isw } from "./isw.ts";
import { wire } from "./wire.ts";
import { polymarket } from "./polymarket.ts";
import { sec_edgar } from "./sec_edgar.ts";
import { fred } from "./fred.ts";
import { journal_rss } from "./journal_rss.ts";
import { market_data } from "./market_data.ts";

export const COLLECTORS: Collector[] = [
  hackernews,
  reddit,
  arxiv,
  github,
  youtube,
  pubmed,
  biorxiv,
  medrxiv,
  openfda,
  clinicaltrials,
  gdelt,
  reliefweb,
  isw,
  wire,
  polymarket,
  sec_edgar,
  fred,
  journal_rss,
  market_data,
];
