// Progress lines for long runs, so a run in GitHub Actions is never silent.
// - One line every `every` finished items, and at the end.
// - A heartbeat line when no line was written for `heartbeatMs` (for example
//   while requests are slow or the client waits after HTTP 429).

export interface ProgressOptions {
  total: number;
  every?: number;
  heartbeatMs?: number;
  clock?: () => number;
  log?: (line: string) => void;
  /** Extra text for each line, for example the average response time. */
  details?: () => string;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m ${sec}s` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export class Progress {
  done = 0;
  withData = 0;
  private readonly total: number;
  private readonly every: number;
  private readonly heartbeatMs: number;
  private readonly clock: () => number;
  private readonly log: (line: string) => void;
  private readonly details: () => string;
  private readonly startedAt: number;
  private lastLineAt: number;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(opts: ProgressOptions) {
    this.total = opts.total;
    this.every = opts.every ?? 100;
    this.heartbeatMs = opts.heartbeatMs ?? 60_000;
    this.clock = opts.clock ?? Date.now;
    this.log = opts.log ?? ((line) => console.log(line));
    this.details = opts.details ?? (() => "");
    this.startedAt = this.clock();
    this.lastLineAt = this.startedAt;
  }

  /** Counts items that were already done before this run (for example from a cache). */
  skip(count: number, withData: number): void {
    this.done += count;
    this.withData += withData;
  }

  /** Records one finished item. */
  tick(hasData: boolean): void {
    this.done++;
    if (hasData) this.withData++;
    if (this.done % this.every === 0 || this.done === this.total) this.line("");
  }

  /** Writes a heartbeat line if no line was written for heartbeatMs. */
  heartbeat(): void {
    if (this.clock() - this.lastLineAt >= this.heartbeatMs) this.line(" (still running)");
  }

  /** Starts the heartbeat timer. Call stop() at the end. */
  start(): void {
    this.timer = setInterval(() => this.heartbeat(), Math.min(this.heartbeatMs, 10_000));
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private line(suffix: string): void {
    const now = this.clock();
    this.lastLineAt = now;
    const extra = this.details();
    this.log(
      `[${this.done}/${this.total}] pairs with data: ${this.withData}, elapsed ${formatDuration(now - this.startedAt)}` +
        (extra ? `, ${extra}` : "") +
        suffix,
    );
  }
}
