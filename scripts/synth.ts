#!/usr/bin/env tsx
// Edition synthesis CLI.
//   tsx scripts/synth.ts --date <YYYY-MM-DD> --vertical <ai|bio|geo|markets|all>
//                        [--provider gemini|openai|anthropic|openrouter]
//                        [--model <id>] [--input-json <path>] [--dry-run]
//
// --input-json: validate the hand-crafted/agent-assisted edition JSON, then
// write it to src/content/editions/{date}/{vertical}.json.
// Otherwise: call the LLM provider with the env key; without a key, print a
// clear message and exit 0 without writing.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { validateEditionData, type Violation } from "./validate.ts";
import { VERTICALS, type RawItem, type Vertical } from "./lib/types.ts";
import { readVertical } from "./lib/store.ts";

interface Args {
  date: string;
  vertical: string;
  provider: string;
  model?: string;
  inputJson?: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { date: new Date().toISOString().slice(0, 10), vertical: "all", provider: process.env.LLM_PROVIDER || "gemini", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--date") a.date = argv[++i] ?? a.date;
    else if (arg === "--vertical") a.vertical = argv[++i] ?? "all";
    else if (arg === "--provider") a.provider = argv[++i] ?? a.provider;
    else if (arg === "--model") a.model = argv[++i];
    else if (arg === "--input-json") a.inputJson = argv[++i];
    else if (arg === "--dry-run") a.dryRun = true;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date)) throw new Error(`bad --date: ${a.date}`);
  if (a.vertical !== "all" && !VERTICALS.includes(a.vertical as Vertical)) throw new Error(`bad --vertical: ${a.vertical}`);
  return a;
}

function failViolations(file: string, violations: Violation[]): never {
  console.error(`VALIDATION FAILED: ${file}`);
  for (const v of violations) console.error(`  ${v.path}: ${v.message}`);
  process.exit(1);
}

function editionsPath(date: string, vertical: Vertical): string {
  return join(process.cwd(), "src", "content", "editions", date, `${vertical}.json`);
}

// ---------------- provider calls (global fetch, no SDK) ----------------

function providerKey(provider: string): string | undefined {
  const map: Record<string, string> = {
    gemini: "GEMINI_API_KEY",
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
  };
  const name = map[provider];
  if (!name) return undefined;
  return process.env[name];
}

async function callProvider(provider: string, model: string | undefined, prompt: string): Promise<string> {
  const key = providerKey(provider);
  if (!key) throw new Error("NO_KEY");
  const system = "You are an editorial pipeline for a daily digest. Output ONLY valid JSON, no markdown fences.";
  const user = prompt.slice(0, 60_000);

  if (provider === "gemini") {
    const modelId = model ?? "gemini-2.5-flash";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
        }),
      }
    );
    if (!res.ok) throw new Error(`gemini HTTP ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  }

  if (provider === "openai" || provider === "openrouter") {
    const url = provider === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: model ?? (provider === "openai" ? "gpt-4o-mini" : "openrouter/auto"),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.4,
      }),
    });
    if (!res.ok) throw new Error(`${provider} HTTP ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? "";
  }

  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: model ?? "claude-sonnet-4-5",
        max_tokens: 4096,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`anthropic HTTP ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    return data.content?.map((c) => c.text ?? "").join("") ?? "";
  }

  throw new Error(`unknown provider: ${provider}`);
}

function stripFences(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : text).trim();
}

function buildPrompt(vertical: Vertical, items: RawItem[]): string {
  const synthesis = `Synthesize one Signal Room edition JSON for vertical "${vertical}". Follow the synthesis prompt rules in scripts/prompts/synthesis.md exactly: headline verbatim from sources, tldr exactly 3 sentences, every body block >=1 citation resolving to sources[], >=2 distinct sources per story, no-advice YMYL tone, set confidence. Output only the edition JSON object.`;
  const itemsJson = JSON.stringify(items.slice(0, 40), null, 1);
  return `${synthesis}\n\nITEMS:\n${itemsJson}`;
}

// ---------------- main ----------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const targets: Vertical[] = args.vertical === "all" ? VERTICALS : [args.vertical as Vertical];

  // Agent-assisted path: --input-json
  if (args.inputJson) {
    const raw = await readFile(args.inputJson, "utf8");
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (err: unknown) {
      console.error(`invalid JSON in ${args.inputJson}: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
    const violations = validateEditionData(data);
    if (violations.length > 0) failViolations(args.inputJson, violations);
    const edition = data as { date: string; vertical: string };
    if (args.dryRun) {
      console.log(`(dry-run) ${args.inputJson} valid; would write src/content/editions/${edition.date}/${edition.vertical}.json`);
      return;
    }
    for (const vertical of targets) {
      const vData = edition.vertical === vertical ? edition : null;
      if (!vData) continue;
      const out = editionsPath(edition.date, vertical);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, JSON.stringify(edition, null, 2) + "\n", "utf8");
      console.log(`wrote ${out}`);
    }
    return;
  }

  // LLM path
  const provider = args.provider;
  if (!providerKey(provider)) {
    console.log(
      `No API key for provider "${provider}" (looked for ${provider.toUpperCase()}_API_KEY in env).\n` +
        "Skipping synthesis without writing any files. Set the key in .env or use --input-json for the agent-assisted path."
    );
    process.exit(0);
  }

  for (const vertical of targets) {
    const items = await readVertical(args.date, vertical);
    if (items.length === 0) {
      console.log(`[${vertical}] no collected items for ${args.date}; skipping`);
      continue;
    }
    const prompt = buildPrompt(vertical, items);
    try {
      const text = await callProvider(provider, args.model, prompt);
      const json = stripFences(text);
      const data: unknown = JSON.parse(json);
      const violations = validateEditionData(data);
      if (violations.length > 0) failViolations(`synth:${vertical}`, violations);
      if (args.dryRun) {
        console.log(`[${vertical}] (dry-run) synthesis valid; not written`);
        continue;
      }
      const out = editionsPath(args.date, vertical);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, JSON.stringify(data, null, 2) + "\n", "utf8");
      console.log(`[${vertical}] wrote ${out}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[${vertical}] synthesis skipped: ${msg}`);
    }
  }
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "");
if (isDirectRun) {
  main().catch((err: unknown) => {
    console.error("synth failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

export { callProvider };
