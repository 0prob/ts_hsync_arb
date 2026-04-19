type BatchFetchResult = {
  addr: string;
  normalized: any;
  error: any;
};

type PollerBaseOptions = {
  verbose?: boolean;
};

export abstract class TimedPoller {
  protected _verbose: boolean;
  protected _timer: ReturnType<typeof setTimeout> | null;
  protected _running: boolean;
  protected _passCount: number;

  constructor(options: PollerBaseOptions = {}) {
    this._verbose = options.verbose ?? false;
    this._timer = null;
    this._running = false;
    this._passCount = 0;
  }

  protected _completePass(label: string, startedAt: number, updated: number, failed: number) {
    const durationMs = Date.now() - startedAt;
    this._passCount++;
    console.log(
      `[${label}] Pass #${this._passCount}: ${updated} updated, ${failed} failed (${durationMs}ms)`
    );
    return { updated, failed, durationMs };
  }

  protected _storeBatchResults(
    label: string,
    cache: Map<string, any>,
    results: BatchFetchResult[],
    onVerboseSuccess?: (entry: BatchFetchResult) => string
  ) {
    let updated = 0;
    let failed = 0;

    for (const entry of results) {
      if (entry.normalized) {
        cache.set(entry.addr, entry.normalized);
        updated++;
        if (this._verbose && onVerboseSuccess) {
          console.log(onVerboseSuccess(entry));
        }
        continue;
      }

      failed++;
      if (this._verbose) {
        console.warn(`[${label}] Failed ${entry.addr}: ${entry.error?.message}`);
      }
    }

    return { updated, failed };
  }

  protected _startLoop(label: string, intervalMs: number, poll: () => Promise<unknown>) {
    if (this._running) return;
    this._running = true;

    const loop = async () => {
      if (!this._running) return;
      try {
        await poll();
      } catch (err: any) {
        console.error(`[${label}] Poll error: ${err.message}`);
      }
      if (this._running) {
        this._timer = setTimeout(loop, intervalMs);
      }
    };

    loop();
  }

  stop() {
    this._running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  get isRunning() {
    return this._running;
  }
}

export function asBatchResult(addr: string, normalized: any, error: any = null) {
  return { addr, normalized, error };
}
