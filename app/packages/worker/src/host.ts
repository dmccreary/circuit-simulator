// The engine host (simulation-engine.md §6): run states, the real-time to
// simulated-time budget, command application between steps, and frame
// batching with back-pressure. Clock, scheduler and post are injected so the
// loop runs headless in Node tests.

import { createEngine, type Engine, type EngineOptions, type TimeScales } from "@cs/engine";
import type { ModelFactory } from "@cs/elements";
import { encodeFrame } from "./frame";
import type { Command, Frame, RunState, SimEvent, WorkerMessage } from "./protocol";

export interface EngineHostDeps {
  /** Milliseconds, monotonic. */
  now(): number;
  schedule(fn: () => void, delayMs: number): void;
  post(msg: WorkerMessage, transfer?: Transferable[]): void;
  getModelFactory(type: string): ModelFactory | undefined;
  engineOptions?: EngineOptions;
  /** Compute cap per tick, ms (default 8). */
  computeBudgetMs?: number;
  /** Minimum interval between frames, ms (default 16). */
  frameIntervalMs?: number;
  /** Frames in flight before merging (default 2). */
  maxUnacked?: number;
  /** Pending samples kept while the main thread is behind (default 100,000). */
  maxPendingSamples?: number;
}

const RUN_TICK_MS = 4;
/** Real time counted per tick at most, so a throttled tab does not owe a huge jump. */
const MAX_TICK_GAP_MS = 100;
const STEP_TO_EVENT_MAX_STEPS = 200000;

/** Simulated seconds per real second for "Fit to circuit" (SIM-10). */
export function fitSpeed(ts: TimeScales): number {
  if (ts.kind === "periodic" && ts.sourcePeriods.length > 0) return Math.max(...ts.sourcePeriods);
  if (ts.kind === "transient") return 5 * ts.dominant; // settles in about a second
  return 1;
}

export class EngineHost {
  private engine: Engine | null = null;
  private runState: RunState = "paused";
  private resumeState: RunState = "paused";
  private speed: number | "fit" = "fit";
  private effectiveSpeed = 1;
  private slower = false;
  private visible = true;
  private queue: Command[] = [];
  private tickScheduled = false;
  private lastTick = 0;
  private lastFrameTime = -Infinity;
  private frameNo = 0;
  private lastAcked = 0;
  private dirty = false;
  private stepToEventCount = 0;
  /** Simulated time owed so far; steps are natural size, so overshoot is repaid, not compounded. */
  private simTarget = 0;
  private diagVersion = -1;
  private tsVersion = -1;

  // The frame being accumulated.
  private pendT0 = 0;
  private pendIds: string[] = [];
  private pendTimes: number[] = [];
  private pendCols: number[][] = [];
  private pendEvents: SimEvent[] = [];

  private readonly budget: number;
  private readonly frameInterval: number;
  private readonly maxUnacked: number;
  private readonly maxPending: number;

  constructor(private readonly deps: EngineHostDeps) {
    this.budget = deps.computeBudgetMs ?? 8;
    this.frameInterval = deps.frameIntervalMs ?? 16;
    this.maxUnacked = deps.maxUnacked ?? 2;
    this.maxPending = deps.maxPendingSamples ?? 100000;
  }

  get state(): RunState {
    return this.runState;
  }

  get time(): number {
    return this.engine?.time ?? 0;
  }

  /** Entry point for every message from the main thread. */
  handle(cmd: Command): void {
    if (cmd.type === "ackFrame") {
      this.lastAcked = Math.max(this.lastAcked, cmd.frame);
    } else {
      this.queue.push(cmd);
    }
    this.ensureTick(0);
  }

  /** One pass of the loop (§6.2). Public for tests. */
  tick(): void {
    this.tickScheduled = false;
    const start = this.deps.now();
    const elapsed = Math.min(Math.max(0, start - this.lastTick), MAX_TICK_GAP_MS);
    this.lastTick = start;

    const cmds = this.queue;
    this.queue = [];
    for (const c of cmds) this.apply(c);

    const e = this.engine;
    if (e && this.visible && e.status === "ok") {
      if (this.runState === "running") this.run(e, start, elapsed);
      else {
        this.simTarget = e.time;
        if (this.runState === "stepping") this.stepToEvent(e, start);
      }
    }
    this.collect();
    this.maybeEmit(this.deps.now());
    this.reschedule();
  }

  // ------------------------------------------------------------ commands

  private apply(cmd: Command): void {
    if (cmd.type === "load") {
      this.load(cmd);
      return;
    }
    const e = this.engine;
    if (!e) return;
    switch (cmd.type) {
      case "replaceNetlist":
        e.replaceNetlist(cmd.netlist, cmd.identity);
        this.afterEdit(e);
        break;
      case "setParams":
        e.setParams(cmd.changes);
        this.afterEdit(e);
        break;
      case "setChannels":
        this.collect();
        if (this.pendTimes.length > 0) this.emit(this.deps.now()); // flush the old layout
        e.setChannels(cmd.channels);
        break;
      case "run":
        if (this.runState !== "stopped") this.runState = "running";
        else this.resumeState = "running";
        break;
      case "pause":
        if (this.runState !== "stopped") this.runState = "paused";
        else this.resumeState = "paused";
        break;
      case "step":
        if (this.runState === "stopped") break;
        this.runState = "paused";
        this.checkStop(e, e.step());
        break;
      case "stepToEvent":
        if (this.runState === "stopped") break;
        this.runState = "stepping";
        this.stepToEventCount = 0;
        break;
      case "reset":
        e.reset(cmd.start);
        this.runState = e.status === "ok" ? "paused" : "stopped";
        this.resumeState = "paused";
        break;
      case "setSpeed":
        this.speed = cmd.speed;
        break;
      case "setPauseConditions":
        e.setPauseConditions(cmd.conditions);
        break;
      case "getStateAt": {
        const display = e.stateAt(cmd.t);
        this.deps.post({ type: "stateAt", requestId: cmd.requestId, t: cmd.t, display }, display ? [display.buffer as ArrayBuffer] : []);
        return;
      }
      case "restartFrom":
        if (e.restartFrom(cmd.t)) this.runState = "paused";
        break;
      case "setVisibility":
        this.visible = cmd.visible;
        if (cmd.visible) this.lastTick = this.deps.now();
        break;
    }
    this.dirty = true;
  }

  private load(cmd: Extract<Command, { type: "load" }>): void {
    this.pendTimes = [];
    this.pendCols = [];
    this.pendEvents = [];
    const e = createEngine(cmd.netlist, (t) => this.deps.getModelFactory(t), this.deps.engineOptions);
    e.setChannels(cmd.channels);
    this.engine = e;
    this.pendT0 = e.time;
    this.pendIds = [...e.channelIds];
    this.pendCols = this.pendIds.map(() => []);
    this.runState = e.status === "ok" ? "paused" : "stopped"; // SIM-01a
    this.resumeState = "paused";
    this.diagVersion = -1;
    this.tsVersion = -1;
    this.dirty = true;
  }

  /** SIM-15: an edit that makes the circuit solvable resumes the previous state. */
  private afterEdit(e: Engine): void {
    if (e.status === "ok" && this.runState === "stopped") this.runState = this.resumeState;
    else if (e.status !== "ok" && this.runState !== "stopped") {
      this.resumeState = this.runState;
      this.runState = "stopped";
    }
  }

  private checkStop(e: Engine, out: { ok: boolean }): boolean {
    if (out.ok) return false;
    if (e.status !== "ok") {
      this.resumeState = this.runState === "stepping" ? "paused" : this.runState;
      this.runState = "stopped";
    }
    return true;
  }

  // ------------------------------------------------------------ stepping

  private requestedSpeed(e: Engine): number {
    return this.speed === "fit" ? fitSpeed(e.timeScales) : this.speed;
  }

  private run(e: Engine, start: number, elapsedMs: number): void {
    const speed = this.requestedSpeed(e);
    const t0 = e.time;
    this.simTarget += (speed * elapsedMs) / 1000;
    let capped = false;
    while (e.time < this.simTarget) {
      if (this.deps.now() - start >= this.budget) {
        capped = true;
        break;
      }
      const out = e.step();
      if (this.checkStop(e, out)) break;
      this.dirty = true;
      if (out.pause) {
        this.runState = "paused";
        break;
      }
    }
    if (capped) this.simTarget = e.time;
    if (capped && elapsedMs > 0) {
      // PRF-09: lower the effective speed rather than let debt pile up.
      const achieved = ((e.time - t0) * 1000) / elapsedMs;
      this.effectiveSpeed = this.slower ? 0.7 * this.effectiveSpeed + 0.3 * achieved : achieved;
      this.slower = true;
    } else if (!capped) {
      this.effectiveSpeed = speed;
      this.slower = false;
    }
  }

  private stepToEvent(e: Engine, start: number): void {
    while (this.deps.now() - start < this.budget) {
      const out = e.step();
      this.dirty = true;
      if (this.checkStop(e, out)) return;
      if (out.pause || out.breakpoint || ++this.stepToEventCount >= STEP_TO_EVENT_MAX_STEPS) {
        this.runState = "paused";
        return;
      }
    }
  }

  // ------------------------------------------------------------ frames

  /** Move engine samples/events into the pending frame, and post side messages. */
  private collect(): void {
    const e = this.engine;
    if (!e) return;
    const block = e.drainSamples();
    const n = block.times.length;
    if (n > 0) {
      if (block.channelIds.join("\u0000") !== this.pendIds.join("\u0000")) {
        this.pendIds = block.channelIds;
        this.pendTimes = [];
        this.pendCols = this.pendIds.map(() => []);
      }
      for (let i = 0; i < n; i++) this.pendTimes.push(block.times[i]);
      this.pendCols.forEach((col, k) => {
        for (let i = 0; i < n; i++) col.push(block.samples[k * n + i]);
      });
      const over = this.pendTimes.length - this.maxPending;
      if (over > 0) {
        this.pendTimes.splice(0, over);
        for (const col of this.pendCols) col.splice(0, over);
      }
      this.dirty = true;
    }
    const events = e.drainEvents();
    if (events.length > 0) {
      this.pendEvents.push(...events);
      this.dirty = true;
    }
    if (e.diagnosticsVersion !== this.diagVersion) {
      this.diagVersion = e.diagnosticsVersion;
      this.deps.post({ type: "diagnostics", diagnostics: e.diagnostics.map(({ fixes: _f, ...d }) => d) });
    }
    if (e.timeScalesVersion !== this.tsVersion) {
      this.tsVersion = e.timeScalesVersion;
      this.deps.post({ type: "timeScales", timeScales: e.timeScales });
    }
  }

  private maybeEmit(now: number): void {
    if (!this.engine || !this.dirty) return;
    if (now - this.lastFrameTime < this.frameInterval) return;
    if (this.frameNo - this.lastAcked >= this.maxUnacked) return; // merge into the pending frame
    this.emit(now);
  }

  private emit(now: number): void {
    const e = this.engine!;
    const n = this.pendTimes.length;
    const k = this.pendIds.length;
    const samples = new Float64Array(n * k);
    this.pendCols.forEach((col, c) => samples.set(col, c * n));
    const frame: Frame = {
      frame: ++this.frameNo,
      t0: this.pendT0,
      t1: e.time,
      runState: this.runState,
      effectiveSpeed: this.runState === "running" ? this.effectiveSpeed : this.requestedSpeed(e),
      slowerThanRequested: this.runState === "running" && this.slower,
      channelIds: this.pendIds.slice(),
      times: Float64Array.from(this.pendTimes),
      samples,
      display: e.displayState(),
      events: this.pendEvents,
    };
    const buffer = encodeFrame(frame, e.logicStates());
    this.deps.post({ type: "frame", buffer }, [buffer]);
    this.lastFrameTime = now;
    this.pendT0 = e.time;
    this.pendTimes = [];
    this.pendCols = this.pendIds.map(() => []);
    this.pendEvents = [];
    this.dirty = false;
  }

  // ------------------------------------------------------------ scheduling

  private ensureTick(delay: number): void {
    if (this.tickScheduled) return;
    this.tickScheduled = true;
    this.deps.schedule(() => this.tick(), delay);
  }

  private reschedule(): void {
    if (this.queue.length > 0) return this.ensureTick(0);
    const active = (this.runState === "running" || this.runState === "stepping") && this.visible;
    if (active) return this.ensureTick(RUN_TICK_MS);
    if (this.dirty && this.frameNo - this.lastAcked < this.maxUnacked) {
      // Wait out the frame interval; an ack schedules its own tick.
      this.ensureTick(Math.max(0, this.frameInterval - (this.deps.now() - this.lastFrameTime)));
    }
  }
}
