// Tests for scripts/validate.ts (run by `node --test`).
import test from "node:test";
import assert from "node:assert/strict";
import { validateEditionData, validateEditionFile, validatePath, summarize } from "../scripts/validate.ts";

function validEdition(overrides = {}, storyOverrides = {}) {
  return {
    date: "2026-09-20",
    generatedAt: "2026-09-20T06:00:00Z",
    vertical: "ai",
    title: "AI signals for 2026-09-20",
    summary: "Two developments in AI policy and models.",
    stories: [
      {
        slug: "openai-open-weights-release",
        headline: "OpenAI releases new open-weight model",
        dek: "A fast-moving model story.",
        type: "BRIEF",
        readMinutes: 3,
        tldr: ["OpenAI shipped a new model.", "It is open-weight.", "Benchmarks look strong."],
        body: [
          { text: "The model was released today.", citations: [1] },
          { text: "Independent benchmarks corroborate.", citations: [2] },
        ],
        whyItMatters: "Open weights change the competitive landscape.",
        editorNote: "Two independent sources confirm.",
        cluster: [{ url: "https://example.com/b", source: "github", title: "Model repo" }],
        sources: [
          { id: 1, url: "https://example.com/a", source: "hackernews", title: "Release", publishedAt: "2026-09-20T00:00:00Z" },
          { id: 2, url: "https://example.com/b", source: "github", title: "Repo" },
        ],
        tags: ["llm"],
        confidence: "high",
        ...storyOverrides,
      },
    ],
    ...overrides,
  };
}

test("valid edition passes with zero violations", () => {
  const v = validateEditionData(validEdition());
  assert.deepEqual(v, []);
});

test("date must be YYYY-MM-DD", () => {
  const v = validateEditionData(validEdition({ date: "09/20/2026" }));
  assert.ok(v.some((x) => x.path === "date"));
});

test("vertical enum enforced", () => {
  const v = validateEditionData(validEdition({ vertical: "crypto" }));
  assert.ok(v.some((x) => x.path === "vertical"));
});

test("tldr must be exactly 3", () => {
  const story = { tldr: ["only one"] };
  const v = validateEditionData(validEdition({}, story));
  assert.ok(v.some((x) => x.path.includes("tldr")));
});

test("slug regex enforced", () => {
  const v = validateEditionData(validEdition({}, { slug: "Bad Slug!" }));
  assert.ok(v.some((x) => x.path.includes("slug")));
});

test("body block citations must be positive ints", () => {
  const v = validateEditionData(validEdition({}, { body: [{ text: "x", citations: [0] }] }));
  assert.ok(v.some((x) => x.path.includes("citations")));
});

test("publish gate: >=2 distinct sources per story", () => {
  const v = validateEditionData(
    validEdition(
      {},
      {
        sources: [{ id: 1, url: "https://example.com/a", source: "hackernews" }],
      }
    )
  );
  assert.ok(v.some((x) => x.message.includes(">=2 distinct sources")));
});

test("publish gate: every citation resolves to sources[]", () => {
  const v = validateEditionData(
    validEdition(
      {},
      {
        body: [{ text: "claim without source", citations: [9] }],
      }
    )
  );
  assert.ok(v.some((x) => x.message.includes("does not resolve")));
});

test("publish gate: headline empty flagged", () => {
  const v = validateEditionData(validEdition({}, { headline: "" }));
  assert.ok(v.some((x) => x.path.includes("headline")));
});

test("publish gate: cluster >=1", () => {
  const v = validateEditionData(validEdition({}, { cluster: [] }));
  assert.ok(v.some((x) => x.path.includes("cluster")));
});

test("confidence enum enforced", () => {
  const v = validateEditionData(validEdition({}, { confidence: "certain" }));
  assert.ok(v.some((x) => x.path.includes("confidence")));
});

test("type enum enforced", () => {
  const v = validateEditionData(validEdition({}, { type: "LONG" }));
  assert.ok(v.some((x) => x.path.includes("type")));
});

test("readMinutes range enforced", () => {
  const v = validateEditionData(validEdition({}, { readMinutes: 0 }));
  assert.ok(v.some((x) => x.path.includes("readMinutes")));
});

test("validateEditionFile works on a real fixture file", async () => {
  const r = await validateEditionFile(new URL("./fixtures/valid/sample-edition.json", import.meta.url).pathname);
  assert.equal(r.valid, true, JSON.stringify(r.violations));
});

test("validatePath on fixtures/valid dir finds the sample and passes", async () => {
  const results = await validatePath(new URL("./fixtures/valid/", import.meta.url).pathname);
  const { total, failed } = summarize(results);
  assert.ok(total >= 1);
  assert.equal(failed, 0, JSON.stringify(results.filter((r) => !r.valid)));
});
