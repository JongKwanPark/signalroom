// Shared HTTP fetch helpers for collectors: retry with exponential backoff
// + jitter, AbortSignal timeout, small concurrency limiter, configurable UA.

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 3;

export interface FetchResult {
  ok: boolean;
  status: number;
  text: string;
  url: string;
  error?: string;
  attempts: number;
}

export interface FetchOptions {
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  accept?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function userAgent(): string {
  return (
    process.env.SIGNALROOM_USER_AGENT ||
    "SignalRoomBot/0.1 (+https://signaldaily.cloud; research digest, non-commercial)"
  );
}

// Fetch with retry (3 attempts by default), exponential backoff with jitter,
// and per-attempt timeout. Retries on network errors, 429 and 5xx.
export async function fetchWithRetry(opts: FetchOptions): Promise<FetchResult> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const headers: Record<string, string> = { "User-Agent": userAgent(), ...(opts.headers || {}) };
  if (opts.accept) headers.Accept = opts.accept;

  let lastError = "unknown error";
  let lastStatus = 0;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(opts.url, { headers, signal: controller.signal, redirect: "follow" });
      clearTimeout(timer);
      const text = await res.text();
      if (res.ok) {
        return { ok: true, status: res.status, text, url: res.url || opts.url, attempts: attempt };
      }
      lastStatus = res.status;
      lastError = `HTTP ${res.status}`;
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable) break;
    } catch (err: unknown) {
      clearTimeout(timer);
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      lastError = controller.signal.aborted && msg.startsWith("AbortError") ? `timeout after ${timeoutMs}ms` : msg;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) {
      const backoff = Math.min(2 ** attempt * 500, 8_000);
      const jitter = Math.random() * 500;
      await sleep(backoff + jitter);
    }
  }
  return { ok: false, status: lastStatus, text: "", url: opts.url, error: lastError, attempts: retries };
}

export async function fetchJson<T = unknown>(opts: FetchOptions): Promise<{ ok: boolean; data?: T; error?: string; status: number }> {
  const res = await fetchWithRetry({ ...opts, accept: opts.accept || "application/json" });
  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  try {
    return { ok: true, data: JSON.parse(res.text) as T, status: res.status };
  } catch (err: unknown) {
    return { ok: false, error: `invalid JSON: ${err instanceof Error ? err.message : String(err)}`, status: res.status };
  }
}

// Small concurrency limiter: runs at most `limit` tasks at once.
export async function runLimited<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      results[i] = await tasks[i]();
    }
  });
  await Promise.all(workers);
  return results;
}

// Tiny XML-ish RSS/Atom parser (Node built-ins only; no DOM).
// Returns items with title/link/publishedAt.
export interface FeedItem {
  title: string;
  link: string;
  publishedAt: string;
}

function stripCdata(s: string): string {
  const m = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/) ?? s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>/);
  return m ? m[1] : s;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
}

function tagContent(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return undefined;
  return decodeEntities(stripCdata(m[1])).trim();
}

export function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const entryRe = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml)) !== null) {
    const block = m[2];
    const title = tagContent(block, "title") ?? "";
    let link = tagContent(block, "link") ?? "";
    if (!link) {
      const href = block.match(/<link[^>]*href="([^"]+)"/i);
      if (href) link = href[1];
    }
    const publishedAt =
      tagContent(block, "pubDate") ??
      tagContent(block, "published") ??
      tagContent(block, "updated") ??
      tagContent(block, "dc:date") ??
      "";
    if (title && link) {
      items.push({ title: title.replace(/\s+/g, " ").trim(), link: link.trim(), publishedAt });
    }
  }
  return items;
}
