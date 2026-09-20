// Market data via stooq.com keyless CSV quotes. Emits one RawItem per symbol
// with the actual close + change % computed from the daily series previous
// close. Never invents numbers: missing data -> no item.
//
// stooq sits behind a SHA-256 proof-of-work challenge for flagged IPs; we
// solve it with node:crypto when it appears (c + n hashing until d leading
// zeros, then POST /__verify with the returned cookie).
import type { Collector, CollectContext, RawItem } from "../lib/types.ts";
import { createHash } from "node:crypto";

const SYMBOLS = ["^spx", "^ndq", "^dji", "^vix", "10usy.b", "eurusd", "usdjpy", "xauusd", "cl.f", "btcusd"];

const SYMBOL_NAMES: Record<string, string> = {
  "^spx": "S&P 500",
  "^ndq": "Nasdaq 100",
  "^dji": "Dow Jones",
  "^vix": "VIX",
  "10usy.b": "US 10Y yield",
  eurusd: "EUR/USD",
  usdjpy: "USD/JPY",
  xauusd: "Gold",
  "cl.f": "WTI Crude (futures)",
  btcusd: "Bitcoin",
};

interface QuoteRow {
  symbol: string;
  date: string;
  close: number;
}

function parseCsv(text: string): QuoteRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.toLowerCase().trim());
  const idx = (name: string) => header.findIndex((h) => h === name);
  const si = idx("symbol");
  const di = idx("date");
  const ci = idx("close");
  if (si < 0 || ci < 0) return [];
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    return {
      symbol: (cols[si] ?? "").trim(),
      date: di >= 0 ? (cols[di] ?? "").trim() : "",
      close: Number.parseFloat(cols[ci] ?? ""),
    };
  });
}

export const market_data: Collector = {
  meta: {
    name: "market_data",
    verticals: ["markets"],
    licenseNote: "Stooq quotes: factual market data via public CSV endpoint",
    requiresKey: false,
  },
  async collect(ctx: CollectContext): Promise<{ items: RawItem[] }> {
    const csv = await stooqGetCsv(quoteUrl());
    if (!csv.ok) throw new Error(`market_data quotes: ${csv.error}`);
    const rows = parseCsv(csv.text).filter((r) => Number.isFinite(r.close));
    if (rows.length === 0) throw new Error("market_data: no parseable quote rows");

    // Daily series per symbol for the previous close (change %).
    const seriesResults = await Promise.all(
      rows.map(async (row) => {
        const series = await stooqGetCsv(dailyUrl(row.symbol));
        if (!series.ok) return null;
        const closes = parseCsv(series.text).filter((r) => Number.isFinite(r.close));
        if (closes.length < 2) return null;
        const prev = closes[closes.length - 2].close;
        if (!prev) return null;
        return { row, prevClose: prev };
      })
    );

    const items: RawItem[] = [];
    for (const result of seriesResults) {
      if (!result) continue;
      const { row, prevClose } = result;
      const changePct = ((row.close - prevClose) / prevClose) * 100;
      const name = SYMBOL_NAMES[row.symbol] ?? row.symbol;
      items.push({
        source: "market_data",
        vertical: "markets",
        title: `${name} closes at ${row.close.toFixed(2)} (${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%)`,
        url: `https://stooq.com/q/?s=${encodeURIComponent(row.symbol)}`,
        publishedAt: row.date ? isoDate(row.date) : `${ctx.date}T00:00:00Z`,
        excerpt: `Close ${row.close.toFixed(2)} vs previous close ${prevClose.toFixed(2)} (stooq ${row.date || ctx.date})`.slice(0, 400),
        licenseNote: "Stooq public CSV; factual price data",
      });
    }
    return { items };
  },
};

const quoteUrl = () =>
  "https://stooq.com/q/l/?" +
  new URLSearchParams({ s: SYMBOLS.join(","), f: "sd2t2ohlcv", h: "", e: "csv" });

const dailyUrl = (symbol: string) =>
  "https://stooq.com/q/d/l/?" +
  new URLSearchParams({ s: symbol, i: "d", d1: ymdDaysAgo(14), d2: ymdDaysAgo(1) });

function ymdDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10).replace(/-/g, "");
}

function isoDate(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T00:00:00Z` : new Date().toISOString();
}

interface CsvResponse {
  ok: boolean;
  text: string;
  error?: string;
}

// GET with cookie jar; if stooq serves its JS proof-of-work challenge,
// solve sha256(c+n) prefix and retry once with the verified cookie.
const COOKIE = { value: "" };
const POW_RE = /const c="([^"]+)",d=(\d+)/;

async function stooqGetCsv(url: string, retries = 2): Promise<CsvResponse> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0 (compatible; SignalRoomBot/0.1)" };
    if (COOKIE.value) headers.Cookie = COOKIE.value;
    try {
      const res = await fetch(url, { headers, redirect: "follow" });
      const text = await res.text();
      if (res.ok) {
        // A real CSV starts with Symbol/Symbol,Datum style headers; the PoW
        // page is HTML.
        if (text.includes("__verify")) {
          const solved = await solvePow(text, url);
          if (solved) continue;
          return { ok: false, text: "", error: "stooq proof-of-work not solvable" };
        }
        return { ok: true, text };
      }
      if (res.status === 404 && !text) {
        // IP-flagged anti-bot response; retry once via the verify handshake.
        const solved = await solvePow("", url);
        if (solved) continue;
      }
      return { ok: false, text: "", error: `HTTP ${res.status}` };
    } catch (err: unknown) {
      if (attempt === retries) return { ok: false, text: "", error: err instanceof Error ? err.message : String(err) };
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  return { ok: false, text: "", error: "stooq retries exhausted" };
}

async function solvePow(body: string, url: string): Promise<boolean> {
  const challenge = body.match(/const c="([^"]+)",d=(\d+)/);
  // On empty 404s we cannot see the challenge; request the main page for one.
  const c = challenge?.[1] ?? (await getChallenge());
  const d = challenge ? Number(challenge[2]) : 4;
  if (!c) return false;
  const target = "0".repeat(d);
  let n = 0;
  for (;;) {
    const hex = createHash("sha256").update(c + n).digest("hex");
    if (hex.startsWith(target)) break;
    n++;
    if (n > 5_000_000) return false;
  }
  try {
    const res = await fetch("https://stooq.com/__verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0 (compatible; SignalRoomBot/0.1)" },
      body: `c=${encodeURIComponent(c)}&n=${n}`,
      redirect: "manual",
    });
    const setCookie = res.headers.get("set-cookie") ?? "";
    const m = setCookie.match(/^[^=]+=([^;]+)/);
    if (m) COOKIE.value = setCookie.split(";")[0];
    return res.ok || Boolean(m);
  } catch {
    return false;
  }
}

async function getChallenge(): Promise<string | undefined> {
  try {
    const res = await fetch("https://stooq.com/", { headers: { "User-Agent": "Mozilla/5.0 (compatible; SignalRoomBot/0.1)" } });
    const text = await res.text();
    const m = text.match(/const c="([^"]+)",d=(\d+)/);
    return m?.[1];
  } catch {
    return undefined;
  }
}
