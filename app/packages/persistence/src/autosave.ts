// Autosave (files-and-persistence.md §5.3, PRF-06): after each committed
// change the latest document is written to `recovery` after a one-second
// pause, and at once when the page is hidden.

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const AUTOSAVE_DELAY_MS = 1000;

export interface AutosaverOptions {
  /** Writes the current state; called at most once per pause. */
  write: () => Promise<void>;
  delayMs?: number;
  timers?: Timers;
  onError?: (e: unknown) => void;
}

export interface Autosaver {
  /** A change was committed: (re)start the pause. */
  schedule(): void;
  /** Write now if a write is pending (page hidden). */
  flush(): Promise<void>;
  /** Drop a pending write (the work was saved or discarded). */
  cancel(): void;
  readonly pending: boolean;
}

const realTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

export function createAutosaver(opts: AutosaverOptions): Autosaver {
  const timers = opts.timers ?? realTimers;
  const delay = opts.delayMs ?? AUTOSAVE_DELAY_MS;
  let handle: unknown;
  let pending = false;

  const run = async () => {
    if (handle !== undefined) timers.clearTimeout(handle);
    handle = undefined;
    if (!pending) return;
    pending = false;
    try {
      await opts.write();
    } catch (e) {
      opts.onError?.(e);
    }
  };

  return {
    schedule() {
      pending = true;
      if (handle !== undefined) timers.clearTimeout(handle);
      handle = timers.setTimeout(() => void run(), delay);
    },
    flush: run,
    cancel() {
      pending = false;
      if (handle !== undefined) timers.clearTimeout(handle);
      handle = undefined;
    },
    get pending() {
      return pending;
    },
  };
}
