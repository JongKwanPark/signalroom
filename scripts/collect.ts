#!/usr/bin/env tsx
// Daily collection CLI.
//   tsx scripts/collect.ts --vertical <ai|bio|geo|markets|all> --date <YYYY-MM-DD>
//                          [--dry-run] [--limit N]
// Writes data/raw/{date}/{source}.jsonl (gitignored), normalized
// data/editions-source/{date}/{vertical}.jsonl and manifest.json.
import { runLimited } from "./lib/fetch.ts";
import { mergeDuplicates } from "./lib/dedup.ts";
import {
  VERTICALS,
  type CollectContext,
  type Collector,
  type RawItem,
  type SourceHealth,
  type Vertical,
  truncateExcerpt,
} from "./lib/types.ts";
import { COLLECTORS } from "./collectors/index.ts";
import { writeManifest, writeRaw, writeVertical, type Manifest } from "./lib/store.ts";

interface Args {
  vertical: string;
  date: string;
  dryRun: boolean;
  limit: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { vertical: "all", date: today(), dryRun: false, limit: 30 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--vertical") args.vertical = argv[++i] ?? "all";
    else if (a === "--date") args.date = argv[++i] ?? today();
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--limit") args.limit = Number.parseInt(argv[++i] ?? "30", 10) || 30;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error(`bad --date: ${args.date}`);
  if (args.vertical !== "all" && !VERTICALS.includes(args.vertical as Vertical)) {
    throw new Error(`bad --vertical: ${args.vertical}`);
  }
  return args;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const targets: Vertical[] = args.vertical === "all" ? VERTICALS : [args.vertical as Vertical];
  const concurrency = Number.parseInt(process.env.COLLECT_CONCURRENCY ?? "4", 10) || 4;

  const manifest: Manifest = {
    date: args.date,
    generatedAt: new Date().toISOString(),
    verticals: {} as Manifest["verticals"],
  };

  for (const vertical of targets) {
    const matching = COLLECTORS.filter((c) => c.meta.verticals.includes(vertical));
    const log = (msg: string) => console.log(`[${vertical}] ${msg}`);

    const tasks = matching.map(
      (collector) => async (): Promise<{ collector: Collector; items: RawItem[]; error?: string }> => {
        const ctx: CollectContext = { date: args.date, vertical, limit: args.limit, dryRun: args.dryRun, log };
        try {
          const result = await collector.collect(ctx);
          return { collector, items: result.items, error: result.error };
        } catch (err: unknown) {
          // Single source failure must never throw out of the run.
          const error = err instanceof Error ? err.message : String(err);
          log(`${collector.meta.name} FAILED: ${error}`);
          return { collector, items: [], error };
        }
      }
    );

    const results = await runLimited(tasks, concurrency);

    const health: SourceHealth[] = results.map(({ collector, items, error }) => ({
      name: collector.meta.name,
      status: error ? "failed" : items.length === 0 ? "empty" : "ok",
      count: items.length,
      ...(error ? { error } : {}),
    }));

    // Raw capture (gitignored) — skipped on dry-run.
    if (!args.dryRun) {
      for (const { collector, items } of results) {
        await writeRaw(args.date, collector.meta.name, items);
      }
    }

    // Normalize + dedup.
    let items: RawItem[] = results.flatMap(({ collector, items }) =>
      items.map((item) => ({
        ...item,
        source: item.source || collector.meta.name,
        vertical,
        excerpt: item.excerpt ? truncateExcerpt(item.excerpt) : undefined,
        licenseNote: item.licenseNote || collector.meta.licenseNote,
      }))
    );
    const { kept, mergedCount } = mergeDuplicates(items);
    items = kept;
    log(`${items.length} unique items (merged ${mergedCount} duplicates)`);

    if (!args.dryRun) await writeVertical(args.date, vertical, items);

    manifest.verticals[vertical] = { items: items.length, sources: health };
  }

  if (!args.dryRun) await writeManifest(manifest);

  console.log("\n=== source health ===");
  for (const [vertical, v] of Object.entries(manifest.verticals)) {
    for (const s of v.sources) {
      console.log(
        `${vertical.padEnd(8)} ${s.name.padEnd(15)} ${s.status.padEnd(7)} ${String(s.count).padStart(3)}${s.error ? `  (${s.error})` : ""}`
      );
    }
  }
  if (args.dryRun) console.log("(dry-run: nothing written)");
}

main().catch((err: unknown) => {
  console.error("collect failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
