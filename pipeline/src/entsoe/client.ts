// ENTSO-E Transparency Platform client.
// - Throttles to 6 requests/s and 350 requests/min (the limit is 400/min per token).
// - HTTP 429: waits 11 minutes, retries up to 2 times.
// - HTTP 5xx and network errors: retries 3 times (2 s, 8 s, 30 s).
// - HTTP 401: fails at once. HTTP 400: fails with the reason from ENTSO-E.
// The token is never logged: it is removed from every message.
import { parseDocument, type ParsedDocument } from "./parse";

export const ENTSOE_URL = "https://web-api.tp.entsoe.eu/api";

export type FetchFn = (url: string) => Promise<{ status: number; text(): Promise<string> }>;

export interface ClientOptions {
  token: string;
  fetchFn?: FetchFn;
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
  log?: (message: string) => void;
  maxPerSecond?: number;
  maxPerMinute?: number;
}

const BACKOFF_MS = [2_000, 8_000, 30_000];
const BAN_WAIT_MS = 11 * 60_000;
const MAX_429_RETRIES = 2;

export function redact(message: string): string {
  return message.replace(/securityToken=[^&\s"')]*/gi, "securityToken=REDACTED");
}

/** yyyyMMddHHmm in UTC. */
export function formatPeriod(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 12);
}

export class EntsoeClient {
  private readonly token: string;
  private readonly fetchFn: FetchFn;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly clock: () => number;
  private readonly log: (message: string) => void;
  private readonly maxPerSecond: number;
  private readonly maxPerMinute: number;
  private readonly sent: number[] = [];
  requestCount = 0;

  constructor(opts: ClientOptions) {
    if (!opts.token) throw new Error("ENTSOE_TOKEN is empty");
    this.token = opts.token;
    this.fetchFn = opts.fetchFn ?? ((url) => fetch(url));
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.clock = opts.clock ?? Date.now;
    this.log = opts.log ?? (() => {});
    this.maxPerSecond = opts.maxPerSecond ?? 6;
    this.maxPerMinute = opts.maxPerMinute ?? 350;
  }

  /** Waits until a request is allowed, then records it. */
  private async throttle(): Promise<void> {
    for (;;) {
      const now = this.clock();
      while (this.sent.length > 0 && now - this.sent[0]! >= 60_000) this.sent.shift();
      let wait = 0;
      if (this.sent.length >= this.maxPerMinute) wait = 60_000 - (now - this.sent[0]!);
      const recent = this.sent.filter((t) => now - t < 1_000);
      if (recent.length >= this.maxPerSecond) wait = Math.max(wait, 1_000 - (now - recent[0]!));
      if (wait <= 0) break;
      await this.sleep(wait);
    }
    this.sent.push(this.clock());
  }

  private scrub(message: string): string {
    return redact(message).split(this.token).join("REDACTED");
  }

  /** Returns the XML body of a successful response. */
  async get(params: Record<string, string>): Promise<string> {
    const url = `${ENTSOE_URL}?${new URLSearchParams({ securityToken: this.token, ...params })}`;
    let serverErrors = 0;
    let bans = 0;
    for (;;) {
      await this.throttle();
      this.requestCount++;
      let res: { status: number; text(): Promise<string> };
      try {
        res = await this.fetchFn(url);
      } catch (err) {
        const reason = this.scrub((err as Error).message);
        if (serverErrors >= BACKOFF_MS.length) throw new Error(`Network error: ${reason}`);
        this.log(`Network error (${reason}); retry ${serverErrors + 1}/${BACKOFF_MS.length}`);
        await this.sleep(BACKOFF_MS[serverErrors++]!);
        continue;
      }
      const body = await res.text();
      if (res.status === 200) return body;
      if (res.status === 401) throw new Error("ENTSO-E rejected the token (HTTP 401)");
      if (res.status === 429) {
        if (bans >= MAX_429_RETRIES) throw new Error("ENTSO-E rate limit (HTTP 429) after retries");
        bans++;
        this.log(`HTTP 429. Waiting 11 minutes (retry ${bans}/${MAX_429_RETRIES}).`);
        await this.sleep(BAN_WAIT_MS);
        continue;
      }
      if (res.status >= 500) {
        if (serverErrors >= BACKOFF_MS.length) {
          throw new Error(`ENTSO-E server error (HTTP ${res.status}) after retries`);
        }
        this.log(`HTTP ${res.status}. Retry ${serverErrors + 1}/${BACKOFF_MS.length}.`);
        await this.sleep(BACKOFF_MS[serverErrors++]!);
        continue;
      }
      throw new Error(`ENTSO-E request failed (HTTP ${res.status}): ${this.reason(body)}`);
    }
  }

  private reason(body: string): string {
    try {
      parseDocument(body);
    } catch (err) {
      return this.scrub((err as Error).message);
    }
    return this.scrub(body.slice(0, 200).replace(/\s+/g, " "));
  }

  /** Fetches and parses one query. "No data" gives an empty document. */
  async fetchDocument(params: Record<string, string>): Promise<ParsedDocument> {
    return parseDocument(await this.get(params));
  }
}
