// Transient engine (simulation-engine.md §2, §8): MNA + trapezoidal rule with
// backward-Euler restarts, adaptive steps, Newton–Raphson, DC operating point.
//
// Mixed signal (§4): the digital kernel (digital/kernel.ts) runs between
// analog steps. Its next event bounds every analog step, A→D threshold
// crossings shorten a step to land just past them, and after each accepted
// step the kernel processes the events due then; if a bridge changed, the
// analog solution is re-solved at the same instant. A circuit with no analog
// parts advances event to event without solving a matrix.

import type { ChannelSpec, Diagnostic, ElementId, IdentityMap, Netlist, PropValue } from "@cs/model";
import type { StepInfo } from "@cs/elements";
import { pow } from "@cs/dmath";
import { MnaSystem, SparseMnaSystem, type Assembly } from "./assembly";
import { ChannelSet, SampleBuffer, type SampleBlock } from "./channels";
import {
  buildCircuit,
  fillDisplay,
  loadAllStates,
  saveAllStates,
  VectorView,
  type Circuit,
  type FactoryLookup,
} from "./circuit";
import { digitalOscillationDiagnostic, floatingDiagnostic, leakDiagnostic, noConvergenceDiagnostic, singularDiagnostic, stepTooLargeDiagnostic } from "./diagnostics";
import { DigitalKernel, DigitalOscillation, type DigitalSnapshot } from "./digital/kernel";
import { floatingGroups } from "./floating";
import { HistoryRing } from "./history";
import { SingularError, type LinearSolver } from "./solver";
import { createSolver } from "./solver-factory";
import { stampStatic, stampStep } from "./stamping";
import { analyzeTimeScales, type TimeScales } from "./timescales";
import type { Engine, EngineEvent, EngineOptions, ParamChange, PauseCondition, StepOutcome } from "./types";

type Resolved = Required<Omit<EngineOptions, "solverFactory">> & { solverFactory: (size: number) => LinearSolver };

const DEFAULTS: Resolved = {
  historySteps: 20000,
  historyBudgetBytes: 64 * 1024 * 1024,
  reltol: 1e-3,
  vntol: 1e-6,
  abstol: 1e-12,
  lteCurrentTol: 1e-9,
  trtol: 7,
  maxNewtonIterations: 50,
  beSteps: 2,
  staticMaxStep: 1e-3,
  checkpointInterval: 256,
  solverFactory: createSolver,
};

const GMIN = 1e-12;
const MAX_HALVINGS = 8; // SIM-16
/** Node-to-ground leak conductances tried, in order, on a singular matrix that ties cannot repair. */
const LEAK_STEPS = [1e-9, 1e-6];
/** Damped Newton (rescue solves only): undamped iterations first, then these step fractions in turn. */
const DAMP_AFTER = 10;
const DAMPING = [0.5, 0.3, 0.7, 0.4];
/** Settle-solve step lengths, as fractions of the fastest time scale, tried in turn on a singular matrix. */
const SETTLE_HOLD = [1e-9, 1e-6, 1e-4];
/** Pseudo-transient continuation (pseudoTransient()): pull conductances (S), settle threshold (V), solve budget. */
const PTRAN_START = 1e-3;
const PTRAN_MAX = 1e3;
const PTRAN_END = 1e-12;
const PTRAN_SETTLED = 1e-3;
const PTRAN_MAX_SOLVES = 400;
/** Node shunts of transient gmin stepping, largest first. */
const GMIN_STEPS = [1e-2, 1e-3, 1e-4, 1e-5, 1e-6, 1e-7, 1e-8, 1e-9, 1e-10, 1e-11, 1e-12];
const MAX_LTE_REJECTS = 30;
const MAX_CROSSING_REFINES = 4;
/** Digital/analog round trips at one instant before giving up (bridges fighting a threshold). */
const MAX_SYNC_PASSES = 50;
/** Round trips after which inputs are taken in one at a time (DigitalKernel.senseFirst). */
const SERIAL_SYNC_AFTER = 8;

interface Checkpoint {
  t: number;
  x: Float64Array;
  states: Float64Array;
  dtNext: number;
  beLeft: number;
  digital: DigitalSnapshot | null;
  /** The solver's pivot order in effect, so a replay factors exactly as the original run did. */
  solver: unknown;
  /** The display state at t, as the ring stored it. */
  display: Float32Array;
  disturbedAt: number;
}

function cloneNetlist(n: Netlist): Netlist {
  return {
    ...n,
    nodeNames: n.nodeNames.slice(),
    settings: { ...n.settings },
    elements: n.elements.map((el) => ({ ...el, nodes: el.nodes.slice(), props: { ...el.props } })),
  };
}

class SolveFailure extends Error {}

class EngineImpl implements Engine {
  netlist: Netlist;
  time = 0;
  status: "ok" | "stopped" = "ok";
  diagnostics: Diagnostic[] = [];
  diagnosticsVersion = 0;
  timeScales: TimeScales = { fastest: 0, dominant: 0, sourcePeriods: [], kind: "static" };
  timeScalesVersion = 0;

  private readonly o: Resolved;
  private c!: Circuit;
  private sys!: Assembly;
  private solver!: LinearSolver;
  /** Pattern version the solver last analyzed. */
  private analyzed = -1;
  /** Matrix values of the latest factorization (valid while hasFactored). */
  private factored = new Float64Array(0);
  private hasFactored = false;
  private x: Float64Array = new Float64Array(1);
  private display: Float64Array = new Float64Array(1);
  private dtNext = 0;
  private beLeft = 0;
  private solverDiags: Diagnostic[] = [];
  private configDiags: Diagnostic[] = [];
  /** Notice that floating nodes were tied to ground (cleared with the circuit). */
  private tieDiags: Diagnostic[] = [];
  private channelSpecs: ChannelSpec[] = [];
  private channels!: ChannelSet;
  private samples = new SampleBuffer([]);
  private channelValues: Float64Array = new Float64Array(0);
  private sampling = true;
  private pauseConds: PauseCondition[] = [];
  private pauseEnabled = true;
  private events: EngineEvent[] = [];
  private ring!: HistoryRing;
  /**
   * Option C of §7.4: the ring keeps only step times and stateAt() re-simulates
   * from the nearest checkpoint, because full display states would exceed
   * historyBudgetBytes.
   */
  private replayHistory = false;
  /** Accepted steps between checkpoints (smaller in replay mode, to bound a scrub's replay). */
  private cpInterval = 256;
  /** True while stateAt()/backfill() re-simulate: nothing is recorded. */
  private replaying = false;
  private checkpoints: Checkpoint[] = [];
  private sinceCheckpoint = 0;
  private dig: DigitalKernel | null = null;
  /** Step-limit inputs from the time-scale analysis (stepLimit()). */
  private steadyScale = 0;
  private decays: { tau: number; window: number }[] = [];
  /** Time of the latest disturbance: load, edit, source edge, digital change. */
  private disturbedAt = 0;

  constructor(netlist: Netlist, private readonly lookup: FactoryLookup, opts: EngineOptions) {
    this.o = { ...DEFAULTS, ...opts } as Resolved;
    this.netlist = cloneNetlist(netlist);
    this.load(this.netlist.settings.start, null);
  }

  // ------------------------------------------------------------ public API

  get displaySize(): number {
    return this.c.displaySize;
  }

  get channelIds(): readonly string[] {
    return this.channels.ids;
  }

  displayState(): Float64Array {
    return this.display.slice();
  }

  readouts(element: ElementId): Record<string, number> {
    const out: Record<string, number> = {};
    const i = this.c.idIndex.get(element);
    const m = i === undefined ? null : this.c.models[i];
    m?.readouts(new VectorView(this.x), { add: (k, v) => void (out[k] = v) });
    return out;
  }

  setChannels(channels: ChannelSpec[]): void {
    this.channelSpecs = channels.slice();
    this.rebuildChannels();
    this.recordSample();
  }

  drainSamples(): SampleBlock {
    return this.samples.drain();
  }

  drainEvents(): EngineEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  setPauseConditions(conditions: PauseCondition[]): void {
    this.pauseConds = conditions.slice();
  }

  stateAt(t: number): Float32Array | null {
    if (!this.replayHistory) return this.ring.stateAt(t);
    if (this.ring.size === 0 || t < this.ring.oldest || t > this.ring.newest) return null;
    let out: Float32Array | null = null;
    this.replayFrom(t, (display) => {
      out = Float32Array.from(display);
    });
    return out;
  }

  backfill(channels: ChannelSpec[]): SampleBlock {
    const set = new ChannelSet(channels, this.c);
    const buf = new SampleBuffer(set.ids);
    const values = new Float64Array(set.length);
    if (!this.replayHistory) {
      const row = new Float64Array(this.c.displaySize);
      for (let i = 0; i < this.ring.size; i++) {
        this.ring.entry(i, row);
        set.evaluate(row, values);
        buf.push(this.ring.timeAt(i), values);
      }
    } else if (this.ring.size > 0) {
      this.replayFrom(this.ring.oldest, null, (t, display) => {
        set.evaluate(display, values);
        buf.push(t, values);
      });
    }
    return buf.drain();
  }

  logicStates(): Uint8Array {
    return this.dig ? this.dig.logicStates(this.display) : new Uint8Array(0);
  }

  step(): StepOutcome {
    if (this.status === "stopped") return { ok: false, t: this.time, dt: 0, breakpoint: false };
    // A singular step that tieFloatingNodes() repaired is retried; each retry tied a new
    // node or raised the leak, so this ends.
    for (;;) {
      const ties = this.c.groundTies?.length ?? 0;
      const leak = this.c.leak ?? 0;
      try {
        return this.dig?.pure ? this.digitalStep() : this.transientStep();
      } catch (e) {
        if (e instanceof SingularError || e instanceof SolveFailure || e instanceof DigitalOscillation) {
          this.handleSolveError(e);
          if (this.status === "ok" && ((this.c.groundTies?.length ?? 0) > ties || (this.c.leak ?? 0) > leak)) continue;
          return { ok: false, t: this.time, dt: 0, breakpoint: false };
        }
        throw e;
      }
    }
  }

  setParams(changes: ParamChange[]): void {
    const touched = new Map<number, Record<string, PropValue>>();
    for (const ch of changes) {
      const i = this.c.idIndex.get(ch.element);
      if (i === undefined) continue;
      const el = this.netlist.elements[i];
      el.props = { ...el.props, [ch.param]: ch.value };
      touched.set(i, el.props);
      this.events.push({ t: this.time, kind: "paramChanged", element: ch.element, detail: ch.param });
    }
    if (touched.size === 0) return;
    for (const [i, props] of touched) {
      this.c.models[i]?.setProps(props);
      this.dig?.markElement(i);
    }
    stampStatic(this.c, this.sys);
    this.afterEdit();
  }

  replaceNetlist(netlist: Netlist, identity: IdentityMap): void {
    const old = this.c;
    const oldStates = saveAllStates(old);
    const oldX = this.x;
    const oldDig = this.dig;
    this.netlist = cloneNetlist(netlist);
    this.build();
    const c = this.c;
    const newToOld = new Map<string, string>();
    for (const [o, n] of Object.entries(identity)) newToOld.set(n, o);
    c.models.forEach((m, i) => {
      if (!m || m.stateSize === 0) return;
      const id = c.netlist.elements[i].id;
      const oldId = newToOld.get(id) ?? (identity[id] === undefined ? id : undefined);
      const oi = oldId === undefined ? undefined : old.idIndex.get(oldId);
      const om = oi === undefined ? null : old.models[oi];
      if (oi === undefined || !om || om.stateSize !== m.stateSize) return;
      m.loadState(oldStates.slice(old.stateOffsets[oi], old.stateOffsets[oi + 1]));
    });
    if (this.dig && oldDig) this.dig.carryOver(oldDig, (id) => newToOld.get(id) ?? (identity[id] === undefined ? id : undefined));
    // Seed the solution with old node voltages by name so Newton starts close.
    const oldByName = new Map<string, number>();
    old.netlist.nodeNames.forEach((name, i) => i > 0 && i <= old.nodeCount && oldByName.set(name, oldX[i]));
    c.netlist.nodeNames.forEach((name, i) => {
      if (i > 0 && i <= c.nodeCount) this.x[i] = oldByName.get(name) ?? 0;
    });
    this.ring = this.makeRing();
    this.rebuildChannels();
    this.events.push({ t: this.time, kind: "topologyChanged" });
    this.afterEdit();
  }

  reset(start?: "zero" | "steady"): void {
    this.events.push({ t: 0, kind: "reset", detail: start });
    this.load(start ?? this.netlist.settings.start, this.channelSpecs);
  }

  restartFrom(t: number): boolean {
    let k = -1;
    for (let i = this.checkpoints.length - 1; i >= 0; i--)
      if (this.checkpoints[i].t <= t) {
        k = i;
        break;
      }
    if (k < 0) return false;
    const cp = this.checkpoints[k];
    this.checkpoints.length = k + 1;
    this.restoreCheckpoint(cp);
    this.ring.truncateAfter(cp.t);
    this.status = "ok";
    this.solverDiags = [];
    this.publishDiagnostics();
    // Replay deterministically to the last natural step at or before t.
    this.sampling = false;
    this.pauseEnabled = false;
    try {
      while (this.time < t) {
        const before = this.snapshot();
        const out = this.step();
        if (!out.ok) break;
        if (this.time > t) {
          this.restoreCheckpoint(before);
          this.ring.truncateAfter(before.t);
          break;
        }
      }
    } finally {
      this.sampling = true;
      this.pauseEnabled = true;
    }
    this.checkpoints = this.checkpoints.filter((c) => c.t <= this.time);
    this.sinceCheckpoint = 0;
    this.events.push({ t: this.time, kind: "reset", detail: "restartFrom" });
    this.recordSample();
    return true;
  }

  // ------------------------------------------------------------ setup

  private build(): void {
    this.c = buildCircuit(this.netlist, this.lookup);
    this.dig = DigitalKernel.create(this.c);
    if (this.dig) this.c.digital = this.dig;
    this.solver = this.o.solverFactory(this.c.size);
    this.sys = this.solver.format === "coordinate" ? new SparseMnaSystem(this.c.size, this.c.nodeCount) : new MnaSystem(this.c.size);
    this.solver.analyze(this.sys.pattern());
    this.analyzed = this.sys.patternVersion;
    this.hasFactored = false;
    this.x = new Float64Array(this.c.size + 1);
    this.display = new Float64Array(this.c.displaySize);
    stampStatic(this.c, this.sys);
  }

  private makeRing(): HistoryRing {
    const width = this.c.displaySize;
    const { historySteps, historyBudgetBytes, checkpointInterval } = this.o;
    this.replayHistory = historySteps * (4 * Math.max(1, width) + 8) > historyBudgetBytes;
    if (!this.replayHistory) {
      this.cpInterval = checkpointInterval;
      return new HistoryRing(width, historySteps);
    }
    // Checkpoints instead: spend the budget on as many as fit across the history.
    const cpBytes = 8 * (this.c.size + 1 + this.c.stateTotal) + 4 * width + 256;
    const fit = Math.max(1, Math.floor((historyBudgetBytes - 8 * historySteps) / cpBytes));
    this.cpInterval = Math.max(1, Math.min(checkpointInterval, Math.ceil(historySteps / fit)));
    return new HistoryRing(0, historySteps);
  }

  private rebuildChannels(): void {
    this.channels = new ChannelSet(this.channelSpecs, this.c);
    this.samples = new SampleBuffer(this.channels.ids);
    this.channelValues = new Float64Array(this.channels.length);
    this.channels.evaluate(this.display, this.channelValues);
  }

  /** Build everything from the netlist and solve t = 0 (SIM-01a: loaded paused, but solved). */
  private load(start: "zero" | "steady", channels: ChannelSpec[] | null): void {
    this.build();
    this.time = 0;
    this.ring = this.makeRing();
    this.checkpoints = [];
    this.sinceCheckpoint = 0;
    this.status = "ok";
    this.solverDiags = [];
    if (channels) this.channelSpecs = channels;
    this.rebuildChannels();
    this.refreshTimeScales();
    this.disturbedAt = this.time;
    this.dtNext = this.stepLimit() / 4;
    this.beLeft = this.o.beSteps;
    try {
      if (start === "steady" && !this.dig?.pure) {
        let x = this.dcOperatingPoint();
        if (!x) throw new SolveFailure();
        this.acceptAll(x, this.info("dc", 0, GMIN, 1));
        if (this.dig) x = this.syncDigital(x);
        this.commitSolution(x);
        this.refreshTimeScales();
      } else {
        this.settle();
        if (this.c.nonlinear) {
          // Time scales of the settled operating point, not of every junction off at x = 0.
          this.refreshTimeScales();
          this.dtNext = this.stepLimit() / 4;
        }
      }
      this.pushCheckpoint();
    } catch (e) {
      this.handleSolveError(e);
    }
    this.publishDiagnostics();
  }

  // ------------------------------------------------------------ solving

  private info(kind: StepInfo["kind"], dt: number, gmin: number, sourceScale: number, method: StepInfo["method"] = "be"): StepInfo {
    return { kind, t: this.time + (kind === "transient" ? dt : 0), dt, method, gmin, sourceScale };
  }

  private linearSolve(): Float64Array {
    const n = this.c.size;
    const sys = this.sys;
    if (sys.patternVersion !== this.analyzed) {
      this.solver.analyze(sys.pattern());
      this.analyzed = sys.patternVersion;
      this.hasFactored = false;
    }
    const A = sys.values();
    // Unchanged matrix (a linear circuit at a fixed step): reuse the factorization (§3).
    let same = this.hasFactored && this.factored.length === A.length;
    if (same) {
      const f = this.factored;
      for (let i = 0; i < A.length; i++)
        if (A[i] !== f[i]) {
          same = false;
          break;
        }
    }
    if (!same) {
      this.hasFactored = false;
      this.solver.factor(A);
      if (this.factored.length !== A.length) this.factored = new Float64Array(A.length);
      this.factored.set(A);
      this.hasFactored = true;
    }
    const x = new Float64Array(n + 1);
    x.set(sys.b, 1);
    if (n > 0) this.solver.solve(x.subarray(1));
    return x;
  }

  /** Newton–Raphson (a single solve for linear circuits). Null when it does not converge. */
  private solveAt(step: StepInfo, guess: Float64Array, shunt: number, maxIter: number, damped = false, anchor?: Float64Array): Float64Array | null {
    const c = this.c;
    if (!c.nonlinear) {
      stampStep(c, this.sys, step, null, shunt, anchor);
      const x = this.linearSolve();
      return allFinite(x) ? x : null;
    }
    let xg = guess;
    for (let iter = 0; iter < maxIter; iter++) {
      stampStep(c, this.sys, step, new VectorView(xg), shunt, anchor);
      const xn = this.linearSolve();
      if (!allFinite(xn)) return null;
      if (this.converged(xn, xg)) return xn;
      if (damped && iter >= DAMP_AFTER) {
        // Damped Newton breaks the limit cycles that junction limiting and saturating
        // outputs can fall into: move only part way, a fraction that varies so a cycle
        // cannot lock onto it.
        const lambda = DAMPING[iter % DAMPING.length];
        for (let i = 1; i < xn.length; i++) xn[i] = xg[i] + lambda * (xn[i] - xg[i]);
      }
      xg = xn;
    }
    return null;
  }

  private converged(xn: Float64Array, xo: Float64Array): boolean {
    const { reltol, vntol, abstol } = this.o;
    const nc = this.c.nodeCount;
    for (let i = 1; i < xn.length; i++) {
      const tol = reltol * Math.max(Math.abs(xn[i]), Math.abs(xo[i])) + (i <= nc ? vntol : abstol);
      if (Math.abs(xn[i] - xo[i]) > tol) return false;
    }
    const vn = new VectorView(xn);
    const vo = new VectorView(xo);
    for (const m of this.c.models) if (m?.nonlinear && m.hasConverged && !m.hasConverged(vn, vo)) return false;
    return true;
  }

  /** DC operating point: plain Newton, then gmin stepping, then source stepping (§2.4). */
  private dcOperatingPoint(): Float64Array | null {
    const iters = this.o.maxNewtonIterations * 2;
    const zero = new Float64Array(this.c.size + 1);
    const at = (gmin: number, scale: number, guess: Float64Array) =>
      this.solveAt(this.info("dc", 0, gmin, scale), guess, gmin, iters);

    let x = at(GMIN, 1, zero);
    if (x) return x;

    let g = 1e-2;
    x = zero;
    while (x && g > GMIN) {
      x = at(g, 1, x);
      g /= 10;
    }
    if (x) {
      x = at(GMIN, 1, x);
      if (x) return x;
    }

    x = at(GMIN, 0, zero);
    let scale = 0;
    let ds = 0.1;
    while (x && scale < 1) {
      const next = Math.min(1, scale + ds);
      const xr = at(GMIN, next, x);
      if (xr) {
        x = xr;
        scale = next;
        ds = Math.min(ds * 2, 0.5);
      } else {
        ds /= 4;
        if (ds < 1e-6) return null;
      }
    }
    return x;
  }

  /**
   * Solve the circuit at the present time with every reactive element held at
   * its stored state: a backward-Euler step so short that capacitors act as
   * voltage sources and inductors as current sources. Used at t = 0 and after edits.
   */
  private settle(): void {
    let x = this.solveHere();
    if (this.dig) x = this.syncDigital(x);
    this.commitSolution(x);
  }

  /** The step the settle solve uses: backward Euler, so short that every state is held. */
  private settleStep(hold = SETTLE_HOLD[0]): StepInfo {
    const ts = this.timeScales;
    const dt0 = hold * (ts.kind === "static" ? this.o.staticMaxStep : ts.fastest);
    return { kind: "transient", t: this.time, dt: dt0, method: "be", gmin: GMIN, sourceScale: 1 };
  }

  /** The settle solve without committing: the solution at this.time with states held. */
  private solveHere(): Float64Array {
    if (this.dig?.pure) return this.dig.levelsVector(this.c.size);
    const iters = this.o.maxNewtonIterations * 2;
    let step = this.settleStep();
    let x: Float64Array | null = null;
    let singular: SingularError | null = null;
    // Each attempt starts from the models' accepted state, not from a failed attempt's
    // diverged Newton iterate (models keep their last iterate for voltage limiting).
    const saved = this.c.nonlinear ? saveAllStates(this.c) : null;
    const fresh = () => saved && loadAllStates(this.c, saved);
    // A capacitor held by a step 1e-9 of the fastest time scale has a conductance that can
    // swamp a kilohm next to it below the pivot tolerance; then hold it a little more loosely.
    for (const hold of SETTLE_HOLD) {
      step = this.settleStep(hold);
      fresh();
      try {
        x = this.solveAt(step, this.x, 0, iters);
        singular = null;
        break;
      } catch (e) {
        if (!(e instanceof SingularError)) throw e;
        singular ??= e;
      }
    }
    if (singular) {
      step = this.settleStep();
      if (!this.c.nonlinear) throw singular;
      fresh();
      x = this.gminStepped(step, this.x, iters);
      if (!x) {
        fresh();
        x = this.pseudoTransient(step, this.x, iters);
      }
      if (!x) throw singular;
    }
    if (!x && this.c.nonlinear) {
      fresh();
      x = this.gminStepped(step, this.x, iters);
      if (!x) {
        fresh();
        x = this.sourceStepped(step, iters);
      }
      if (!x) {
        fresh();
        x = this.pseudoTransient(step, this.x, iters);
      }
    }
    if (!x) throw new SolveFailure();
    this.acceptAll(x, step);
    return x;
  }

  /**
   * Source stepping for a step that gmin stepping could not solve either
   * (§2.4): ramp every source from zero to full strength, each solve starting
   * from the last. Null when the ramp stalls.
   */
  private sourceStepped(step: StepInfo, iters: number): Float64Array | null {
    const at = (scale: number, guess: Float64Array): Float64Array | null => {
      try {
        return this.solveAt({ ...step, sourceScale: scale }, guess, 0, iters, true);
      } catch (e) {
        if (e instanceof SingularError) return null;
        throw e;
      }
    };
    let x = at(0, new Float64Array(this.c.size + 1));
    let scale = 0;
    let ds = 0.1;
    while (x && scale < 1) {
      const next = Math.min(1, scale + ds);
      const xr = at(next, x);
      if (xr) {
        x = xr;
        scale = next;
        ds = Math.min(ds * 2, 0.5);
      } else {
        ds /= 4;
        if (ds < 1e-6) return null;
      }
    }
    return x;
  }

  /**
   * Pseudo-transient continuation, the last rescue for a stubborn solve: every
   * node gets a conductance pulling it toward its previous value (a fictitious
   * capacitor stepped by backward Euler), the solve is repeated with each
   * result as the next anchor, and the pull is weakened as the solution settles
   * and strengthened when a solve fails. It walks a high-gain loop (an op-amp
   * driving MOSFETs) to its operating point where Newton alone bounces between
   * the rails. Null if it gives up.
   */
  private pseudoTransient(step: StepInfo, guess: Float64Array, iters: number): Float64Array | null {
    let x = guess;
    let g = PTRAN_START;
    for (let k = 0; k < PTRAN_MAX_SOLVES; k++) {
      let xr: Float64Array | null;
      try {
        xr = this.solveAt(step, x, g, iters, true, x);
      } catch (e) {
        if (!(e instanceof SingularError)) throw e;
        xr = null;
      }
      if (!xr) {
        g *= 10;
        if (g > PTRAN_MAX) return null;
        continue;
      }
      let moved = 0;
      for (let n = 1; n <= this.c.nodeCount; n++) moved = Math.max(moved, Math.abs(xr[n] - x[n]));
      x = xr;
      if (moved < PTRAN_SETTLED) {
        g /= 10;
        if (g < PTRAN_END) break;
      }
    }
    try {
      return this.solveAt(step, x, 0, iters, true);
    } catch (e) {
      if (e instanceof SingularError) return null;
      throw e;
    }
  }

  /**
   * Gmin stepping for a step whose plain Newton failed (§2.4): solve with a
   * large conductance from every node to ground, then shrink it decade by
   * decade, each solve starting from the last. It walks Newton to the
   * solution from a starting point where it diverged or a pivot vanished.
   * Null when a stage fails; the final stage has no extra conductance.
   */
  private gminStepped(step: StepInfo, guess: Float64Array, iters: number): Float64Array | null {
    let x = guess;
    for (const g of [...GMIN_STEPS, 0]) {
      let xr: Float64Array | null;
      try {
        xr = this.solveAt(step, x, g, iters, true);
      } catch (e) {
        if (e instanceof SingularError) return null;
        throw e;
      }
      if (!xr) return null;
      x = xr;
    }
    return x;
  }

  /**
   * Bring the digital side up to date at this.time (§4 synchronization):
   * sense A→D inputs from x, run due events in delta cycles, and re-solve the
   * analog side while bridges keep changing. Returns x itself when nothing
   * changed, else the new solution (not yet committed).
   */
  private syncDigital(x: Float64Array): Float64Array {
    const dig = this.dig!;
    for (let pass = 0; pass < MAX_SYNC_PASSES; pass++) {
      if (pass < SERIAL_SYNC_AFTER) dig.senseAll(x);
      else dig.senseFirst(x);
      if (!dig.run(this.time)) return x;
      x = this.solveHere();
    }
    throw new DigitalOscillation([], this.time);
  }

  /**
   * Ratings (§5, RLM-05/06): after an accepted step, a model reporting a
   * failMode has just switched into its failure; restamp and re-solve here.
   */
  private checkStress(step: StepInfo): void {
    const v = new VectorView(this.x);
    let failed = false;
    this.c.models.forEach((m, i) => {
      const r = m?.stress?.(v, step);
      if (!r?.failMode) return;
      failed = true;
      this.events.push({ t: this.time, kind: "partFailed", element: this.c.netlist.elements[i].id, detail: r.failMode });
    });
    if (!failed) return;
    stampStatic(this.c, this.sys);
    this.afterEdit();
  }

  private acceptAll(x: Float64Array, step: StepInfo): void {
    const v = new VectorView(x);
    for (const m of this.c.models) m?.accept(v, step);
  }

  /** Make x the current solution: display, channels, history, sample, checkpoint. */
  private commitSolution(x: Float64Array): void {
    this.x = x;
    fillDisplay(this.c, x, this.display);
    this.channels.evaluate(this.display, this.channelValues);
    if (!this.replaying) this.ring.push(this.time, this.display);
    this.recordSample();
  }

  private recordSample(): void {
    if (this.sampling && this.channels.length > 0) this.samples.push(this.time, this.channelValues);
  }

  private handleSolveError(e: unknown): void {
    if (e instanceof SingularError && this.tieFloatingNodes(e)) return;
    if (e instanceof SingularError) this.stop(singularDiagnostic(this.c, e.row, this.time));
    else if (e instanceof SolveFailure) this.stop(noConvergenceDiagnostic(this.c, this.time));
    else if (e instanceof DigitalOscillation) this.stop(digitalOscillationDiagnostic(e.elements, e.t));
    else throw e;
  }

  /**
   * Repair a singular matrix, then re-solve; true if the circuit then solves.
   * A singular node row means that node's voltage is undefined: tie it to
   * ground, once per node. A row that ties cannot fix (a branch row, or a
   * node already tied) is numerical: a node held only by conductances far
   * below its neighbours'. Then every node gets a small leak to ground,
   * LEAK_STEPS in turn (CircuitJS1 gets the same effect from the 1e-8 S it
   * puts across cut-off transistors, MosfetElm.java).
   */
  private tieFloatingNodes(first: SingularError): boolean {
    const c = this.c;
    const ties = (c.groundTies ??= []);
    for (let e: unknown = first; e instanceof SingularError; ) {
      const node = e.row + 1;
      const groups = this.floatingNow();
      if (node <= c.nodeCount && !ties.includes(node) && groups.some((g) => g.includes(node))) ties.push(node);
      else if (groups.length) ties.push(groups[0][0]);
      else {
        const next = LEAK_STEPS.find((g) => g > (c.leak ?? 0));
        if (next === undefined) return false;
        c.leak = next;
      }
      try {
        this.settle();
        this.pushCheckpoint();
        this.tieDiags = [];
        if (ties.length) this.tieDiags.push(floatingDiagnostic(c, ties));
        if (c.leak) this.tieDiags.push(leakDiagnostic(c.leak));
        return true;
      } catch (err) {
        if (!(err instanceof SingularError || err instanceof SolveFailure || err instanceof DigitalOscillation)) throw err;
        e = err;
      }
    }
    return false;
  }

  /** Floating node groups of the matrix as the settle solve assembles it now (floating.ts). */
  private floatingNow(): number[][] {
    const step = this.settleStep();
    stampStep(this.c, this.sys, step, this.c.nonlinear ? new VectorView(this.x) : null, 0);
    this.hasFactored = false;
    return floatingGroups(this.sys, this.c.nodeCount, this.c.groundTies ?? []);
  }

  private stop(d: Diagnostic): void {
    this.status = "stopped";
    this.solverDiags = [d];
    this.events.push({ t: this.time, kind: "error", detail: d.id });
    this.publishDiagnostics();
  }

  /** After a value or topology edit: re-solve at the same t; resume if now solvable (SIM-15). */
  private afterEdit(): void {
    this.refreshTimeScales();
    this.beLeft = this.o.beSteps;
    this.disturbedAt = this.time;
    this.dtNext = Math.min(this.dtNext > 0 ? this.dtNext : Infinity, this.stepLimit() / 4);
    this.checkpoints = [];
    this.sinceCheckpoint = 0;
    this.status = "ok";
    this.solverDiags = [];
    try {
      this.settle();
      this.pushCheckpoint();
    } catch (e) {
      this.handleSolveError(e);
    }
    this.publishDiagnostics();
  }

  private publishDiagnostics(): void {
    if (!this.c.groundTies?.length && !this.c.leak) this.tieDiags = [];
    const next = [...this.solverDiags, ...this.configDiags, ...this.tieDiags];
    if (JSON.stringify(next) !== JSON.stringify(this.diagnostics)) {
      this.diagnostics = next;
      this.diagnosticsVersion++;
    }
  }

  private refreshTimeScales(): void {
    const a = analyzeTimeScales(this.c, this.x, this.time);
    this.timeScales = a.scales;
    this.steadyScale = a.steady;
    this.decays = a.decays;
    this.timeScalesVersion++;
    const max = this.netlist.settings.maxTimeStep;
    const ts = this.timeScales;
    this.configDiags =
      max !== undefined && max > 0 && ts.kind !== "static" && max > ts.fastest / 50
        ? [stepTooLargeDiagnostic(max, ts.fastest / 50)]
        : [];
  }

  /** Smallest of the time-scale limit, the manual limit, and the static fallback (§2.3). */
  private stepLimit(): number {
    const ts = this.timeScales;
    let lim = this.o.staticMaxStep;
    if (ts.kind !== "static") {
      // Oscillations and source periods always; a decay only until it has died out
      // after the latest disturbance (timescales.ts, analyzeTimeScales()).
      let fast = this.steadyScale > 0 ? this.steadyScale : Infinity;
      const elapsed = this.time - this.disturbedAt;
      const active = this.decays.find((d) => elapsed < d.window);
      if (active) fast = Math.min(fast, active.tau);
      if (Number.isFinite(fast)) lim = fast / 50;
    }
    const max = this.netlist.settings.maxTimeStep;
    if (max !== undefined && max > 0) lim = Math.min(lim, max);
    return lim;
  }

  // ------------------------------------------------------------ the step

  private transientStep(): StepOutcome {
    const c = this.c;
    const limit = this.stepLimit();
    const dtMin = Math.max(1e-18, limit * 1e-9);
    let proposal = Math.min(this.dtNext, limit);
    let dt = proposal;
    let halvings = 0;
    let lteRejects = 0;
    let refines = 0;
    let refined = false;
    let singular: SingularError | null = null;
    let rescued = false;
    /** The models' state before this step, to restart a rescue from (see solveHere()). */
    const before = saveAllStates(c);
    const bps: number[] = [];

    for (;;) {
      // Land exactly on the next known event.
      bps.length = 0;
      for (const m of c.models) m?.breakpoints?.(this.time, this.time + dt, bps);
      let hitBp = false;
      for (const b of bps)
        if (b > this.time + dtMin * 0.5 && b <= this.time + dt) {
          dt = b - this.time;
          hitBp = true;
        }
      // Analog steps stop at the next digital event (§4).
      const te = this.dig?.nextTime();
      let hitDig = false;
      if (te !== undefined && te > this.time && te <= this.time + dt) {
        dt = te - this.time;
        hitDig = true;
      }

      const method = this.beLeft > 0 ? "be" : "trap"; // TODO: gear2 option
      let step = this.info("transient", dt, GMIN, 1, method);
      let x: Float64Array | null;
      try {
        x = this.solveAt(step, this.x, 0, this.o.maxNewtonIterations);
      } catch (e) {
        // In a nonlinear circuit a vanished pivot is usually a diverged iterate (a node held
        // only by gmin swinging to kilovolts): retry like a failed Newton, and report the
        // singular matrix only if every retry fails.
        if (!(e instanceof SingularError) || !c.nonlinear) throw e;
        singular = e;
        x = null;
      }
      if (!x && (singular || hitBp) && !rescued) {
        // Halving a step that lands on a source edge, or one whose pivot vanished, only walks
        // toward the edge in ever smaller steps (and C/dt grows until pivots underflow).
        // First try the same step with backward Euler, reached by gmin stepping.
        rescued = true;
        loadAllStates(c, before);
        const be = this.info("transient", dt, GMIN, 1, "be");
        const xr = this.gminStepped(be, this.x, this.o.maxNewtonIterations * 2);
        if (xr) {
          x = xr;
          step = be;
          singular = null;
          this.beLeft = Math.max(this.beLeft, this.o.beSteps);
        }
      }
      if (!x) {
        if (halvings < MAX_HALVINGS) {
          halvings++;
          dt /= 2;
          proposal = dt;
          continue;
        }
        // Last resort before SIM-16: a backward-Euler step reached by gmin stepping (§2.4).
        loadAllStates(c, before);
        step = this.info("transient", dt, GMIN, 1, "be");
        x = this.gminStepped(step, this.x, this.o.maxNewtonIterations * 2);
        if (!x) {
          if (singular) throw singular;
          this.stop(noConvergenceDiagnostic(c, step.t));
          return { ok: false, t: this.time, dt: 0, breakpoint: false };
        }
        this.beLeft = Math.max(this.beLeft, this.o.beSteps);
      }

      const ratio = this.lteRatio(x, step);
      if (ratio > 1 && dt > dtMin && lteRejects < MAX_LTE_REJECTS) {
        lteRejects++;
        dt = Math.max(dtMin, dt * Math.max(0.1, 0.9 * pow(ratio, -1 / 3)));
        proposal = dt;
        continue;
      }

      // Land just past the first A→D threshold crossing (§4, via §2.3).
      if (this.dig && refines < MAX_CROSSING_REFINES && dt > dtMin) {
        const frac = this.dig.crossingFraction(this.x, x);
        if (frac < 1 && (1 - frac) * dt > 1e-6 * dt) {
          refines++;
          refined = true;
          dt = Math.max(dtMin, dt * Math.min(1, frac + 1e-6));
          continue;
        }
      }

      const snapshot = this.pauseEnabled && this.pauseConds.length > 0 ? saveAllStates(c) : null;
      this.acceptAll(x, step);
      const display = new Float64Array(c.displaySize);
      fillDisplay(c, x, display);
      const values = new Float64Array(this.channels.length);
      this.channels.evaluate(display, values);
      const hit = snapshot ? this.crossing(this.channelValues, values) : null;
      if (hit && snapshot && refines < MAX_CROSSING_REFINES && (1 - hit.frac) * dt > 1e-6 * dt && dt > dtMin) {
        // Shorten the step to land just past the crossing (§2.3).
        loadAllStates(c, snapshot);
        refines++;
        refined = true;
        dt = Math.max(dtMin, dt * Math.min(1, hit.frac + 1e-6));
        continue;
      }

      // Commit.
      this.time = this.time + dt;
      this.x = x;
      this.display = display;
      this.channelValues = values;
      if (!this.replaying) this.ring.push(this.time, display);
      this.recordSample();
      const grow = ratio > 0 ? Math.min(2, 0.9 * pow(ratio, -1 / 3)) : 2;
      this.dtNext = hitBp || hitDig || refined ? Math.min(proposal, limit) : Math.min(dt * grow, limit);
      this.beLeft = hitBp ? this.o.beSteps : Math.max(0, this.beLeft - 1);
      if (hitBp) this.disturbedAt = this.time;
      if (this.dig) {
        // Events due now; a changed bridge is a discontinuity, so restart with BE.
        const x2 = this.syncDigital(x);
        if (x2 !== x) {
          this.commitSolution(x2);
          this.beLeft = this.o.beSteps;
          this.disturbedAt = this.time;
          hitBp = true;
        }
        hitBp ||= hitDig;
      }
      if (++this.sinceCheckpoint >= this.cpInterval) this.pushCheckpoint();
      let pause: PauseCondition | undefined;
      if (hit) {
        pause = hit.cond;
        this.events.push({ t: this.time, kind: "pauseCondition", detail: hit.cond.id });
      }
      if (this.netlist.settings.realisticRatings) this.checkStress(step);
      return { ok: true, t: this.time, dt, breakpoint: hitBp, pause };
    }
  }

  /**
   * Largest truncation error relative to its tolerance. The contract leaves the
   * unit to the model; elements report the error of their own state: volts for
   * charge-storing parts, amps for parts that own a branch current (inductors).
   */
  private lteRatio(x: Float64Array, step: StepInfo): number {
    const c = this.c;
    const { reltol, vntol, lteCurrentTol, trtol } = this.o;
    const view = new VectorView(x);
    let ratio = 0;
    c.models.forEach((m, i) => {
      if (!m?.truncationError) return;
      const e = m.truncationError(view, step);
      if (!(e > 0)) return;
      let tol: number;
      if (c.hasBranch[i]) {
        let mag = 0;
        for (const u of c.branchesOf[i]) mag = Math.max(mag, Math.abs(x[u]), Math.abs(this.x[u]));
        tol = reltol * mag + lteCurrentTol;
      } else {
        const nodes = c.netlist.elements[i].nodes;
        let mag = 0;
        for (let k = 1; k < nodes.length; k++) {
          mag = Math.max(mag, Math.abs(x[nodes[k]] - x[nodes[0]]), Math.abs(this.x[nodes[k]] - this.x[nodes[0]]));
        }
        tol = reltol * mag + vntol;
      }
      ratio = Math.max(ratio, e / (trtol * tol));
    });
    return ratio;
  }

  private crossing(prev: Float64Array, cur: Float64Array): { cond: PauseCondition; frac: number } | null {
    let best: { cond: PauseCondition; frac: number } | null = null;
    for (const cond of this.pauseConds) {
      const k = this.channels.indexOf(cond.channel);
      if (k < 0) continue;
      const p = prev[k];
      const q = cur[k];
      const crossed = cond.op === "rises-above" ? p < cond.level && q >= cond.level : p > cond.level && q <= cond.level;
      if (!crossed) continue;
      const frac = q === p ? 1 : (cond.level - p) / (q - p);
      if (!best || frac < best.frac) best = { cond, frac };
    }
    return best;
  }

  /** A purely digital circuit: jump to the next event, no matrix (§4). */
  private digitalStep(): StepOutcome {
    const dig = this.dig!;
    const limit = this.stepLimit();
    const te = dig.nextTime();
    const hit = te !== undefined && te > this.time; // idle: advance by the step limit
    const t0 = this.time;
    this.time = hit ? te! : t0 + limit;
    const before = this.channelValues.slice();
    this.commitSolution(this.x); // the old levels at the new time: edges stay vertical
    const x = this.syncDigital(this.x);
    if (x !== this.x) this.commitSolution(x);
    if (++this.sinceCheckpoint >= this.cpInterval) this.pushCheckpoint();
    const cross = this.pauseEnabled && this.pauseConds.length > 0 ? this.crossing(before, this.channelValues) : null;
    if (cross) this.events.push({ t: this.time, kind: "pauseCondition", detail: cross.cond.id });
    return { ok: true, t: this.time, dt: this.time - t0, breakpoint: hit, pause: cross?.cond };
  }

  // ------------------------------------------------------------ checkpoints

  private snapshot(): Checkpoint {
    return {
      t: this.time,
      x: this.x.slice(),
      states: saveAllStates(this.c),
      dtNext: this.dtNext,
      beLeft: this.beLeft,
      digital: this.dig ? this.dig.save() : null,
      solver: this.solver.snapshot?.(),
      display: Float32Array.from(this.display),
      disturbedAt: this.disturbedAt,
    };
  }

  private restoreCheckpoint(cp: Checkpoint): void {
    loadAllStates(this.c, cp.states);
    this.time = cp.t;
    this.x = cp.x.slice();
    this.dtNext = cp.dtNext;
    this.beLeft = cp.beLeft;
    this.disturbedAt = cp.disturbedAt;
    if (this.dig && cp.digital) this.dig.restore(cp.digital);
    this.solver.restore?.(cp.solver);
    this.hasFactored = false;
    fillDisplay(this.c, this.x, this.display);
    this.channels.evaluate(this.display, this.channelValues);
  }

  /**
   * Re-simulate from the latest checkpoint at or before t0 up to the present
   * (§7.4 option C), then put the live state back exactly as it was.
   * `at` receives the display of the latest step at or before t0; `each`
   * receives every step from t0 on. Determinism makes the replay exact.
   */
  private replayFrom(t0: number, at: ((display: Float64Array) => void) | null, each?: (t: number, display: Float64Array) => void): void {
    let k = -1;
    for (let i = this.checkpoints.length - 1; i >= 0; i--)
      if (this.checkpoints[i].t <= t0) {
        k = i;
        break;
      }
    if (k < 0) return;
    const end = this.time;
    const live = this.snapshot();
    const liveDisplay = this.display.slice(); // restoreCheckpoint() overwrites this.display in place
    const liveValues = this.channelValues.slice();
    const saved = {
      status: this.status,
      solverDiags: this.solverDiags,
      diagnostics: this.diagnostics,
      diagnosticsVersion: this.diagnosticsVersion,
      events: this.events.length,
      sampling: this.sampling,
      pauseEnabled: this.pauseEnabled,
      sinceCheckpoint: this.sinceCheckpoint,
    };
    this.replaying = true;
    this.sampling = false;
    this.pauseEnabled = false;
    try {
      const cp = this.checkpoints[k];
      this.restoreCheckpoint(cp);
      const first = Float64Array.from(cp.display);
      let prev: Float64Array = first;
      if (each && cp.t >= t0) each(cp.t, first);
      while (this.time < end) {
        if (!this.step().ok) break;
        if (at && this.time > t0) break;
        prev = this.display;
        if (each && this.time >= t0) each(this.time, this.display);
      }
      at?.(prev);
    } finally {
      this.restoreCheckpoint(live);
      this.display = liveDisplay;
      this.channelValues = liveValues;
      this.status = saved.status;
      this.solverDiags = saved.solverDiags;
      this.diagnostics = saved.diagnostics;
      this.diagnosticsVersion = saved.diagnosticsVersion;
      this.events.length = saved.events;
      this.sampling = saved.sampling;
      this.pauseEnabled = saved.pauseEnabled;
      this.sinceCheckpoint = saved.sinceCheckpoint;
      this.replaying = false;
    }
  }

  private pushCheckpoint(): void {
    if (this.replaying) return;
    this.sinceCheckpoint = 0;
    this.checkpoints.push(this.snapshot());
    // Keep only checkpoints that can still reach the ring's range.
    const oldest = this.ring.oldest;
    while (this.checkpoints.length > 2 && this.checkpoints[1].t <= oldest) this.checkpoints.shift();
  }
}

function allFinite(x: Float64Array): boolean {
  for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i])) return false;
  return true;
}

export function createEngine(netlist: Netlist, getModelFactory: FactoryLookup, opts: EngineOptions = {}): Engine {
  return new EngineImpl(netlist, getModelFactory, opts);
}
