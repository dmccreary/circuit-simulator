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
import { MnaSystem } from "./assembly";
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
import { digitalOscillationDiagnostic, noConvergenceDiagnostic, singularDiagnostic, stepTooLargeDiagnostic } from "./diagnostics";
import { DigitalKernel, DigitalOscillation, type DigitalSnapshot } from "./digital/kernel";
import { HistoryRing } from "./history";
import { DenseLU, SingularError, type LinearSolver } from "./solver";
import { stampStatic, stampStep } from "./stamping";
import { computeTimeScales, type TimeScales } from "./timescales";
import type { Engine, EngineEvent, EngineOptions, ParamChange, PauseCondition, StepOutcome } from "./types";

type Resolved = Required<Omit<EngineOptions, "solverFactory">> & { solverFactory: () => LinearSolver };

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
  solverFactory: () => new DenseLU(),
};

const GMIN = 1e-12;
const MAX_HALVINGS = 8; // SIM-16
const MAX_LTE_REJECTS = 30;
const MAX_CROSSING_REFINES = 4;
/** Digital/analog round trips at one instant before giving up (bridges fighting a threshold). */
const MAX_SYNC_PASSES = 50;

interface Checkpoint {
  t: number;
  x: Float64Array;
  states: Float64Array;
  dtNext: number;
  beLeft: number;
  digital: DigitalSnapshot | null;
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
  private sys!: MnaSystem;
  private solver!: LinearSolver;
  private factored: Float64Array | null = null;
  private x: Float64Array = new Float64Array(1);
  private display: Float64Array = new Float64Array(1);
  private dtNext = 0;
  private beLeft = 0;
  private solverDiags: Diagnostic[] = [];
  private configDiags: Diagnostic[] = [];
  private channelSpecs: ChannelSpec[] = [];
  private channels!: ChannelSet;
  private samples = new SampleBuffer([]);
  private channelValues: Float64Array = new Float64Array(0);
  private sampling = true;
  private pauseConds: PauseCondition[] = [];
  private pauseEnabled = true;
  private events: EngineEvent[] = [];
  private ring!: HistoryRing;
  private checkpoints: Checkpoint[] = [];
  private sinceCheckpoint = 0;
  private dig: DigitalKernel | null = null;

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
    return this.ring.stateAt(t);
  }

  logicStates(): Uint8Array {
    return this.dig ? this.dig.logicStates(this.display) : new Uint8Array(0);
  }

  step(): StepOutcome {
    if (this.status === "stopped") return { ok: false, t: this.time, dt: 0, breakpoint: false };
    try {
      return this.dig?.pure ? this.digitalStep() : this.transientStep();
    } catch (e) {
      if (e instanceof SingularError || e instanceof SolveFailure || e instanceof DigitalOscillation) {
        this.handleSolveError(e);
        return { ok: false, t: this.time, dt: 0, breakpoint: false };
      }
      throw e;
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
    this.sys = new MnaSystem(this.c.size);
    this.solver = this.o.solverFactory();
    this.solver.analyze({ size: this.c.size });
    this.factored = null;
    this.x = new Float64Array(this.c.size + 1);
    this.display = new Float64Array(this.c.displaySize);
    stampStatic(this.c, this.sys);
  }

  private makeRing(): HistoryRing {
    const width = this.c.displaySize;
    const byBudget = Math.floor(this.o.historyBudgetBytes / (4 * Math.max(1, width) + 8));
    return new HistoryRing(width, Math.min(this.o.historySteps, byBudget));
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
    const A = this.sys.A;
    let same = this.factored !== null;
    if (same) {
      const f = this.factored!;
      for (let i = 0; i < A.length; i++)
        if (A[i] !== f[i]) {
          same = false;
          break;
        }
    }
    if (!same) {
      this.factored = null;
      this.solver.factor(A);
      this.factored = Float64Array.from(A);
    }
    const rhs = Float64Array.from(this.sys.b);
    if (n > 0) this.solver.solve(rhs);
    const x = new Float64Array(n + 1);
    x.set(rhs, 1);
    return x;
  }

  /** Newton–Raphson (a single solve for linear circuits). Null when it does not converge. */
  private solveAt(step: StepInfo, guess: Float64Array, shunt: number, maxIter: number): Float64Array | null {
    const c = this.c;
    if (!c.nonlinear) {
      stampStep(c, this.sys, step, null, shunt);
      const x = this.linearSolve();
      return allFinite(x) ? x : null;
    }
    let xg = guess;
    for (let iter = 0; iter < maxIter; iter++) {
      stampStep(c, this.sys, step, new VectorView(xg), shunt);
      const xn = this.linearSolve();
      if (!allFinite(xn)) return null;
      if (this.converged(xn, xg)) return xn;
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

  /** The settle solve without committing: the solution at this.time with states held. */
  private solveHere(): Float64Array {
    if (this.dig?.pure) return this.dig.levelsVector(this.c.size);
    const ts = this.timeScales;
    const dt0 = 1e-9 * (ts.kind === "static" ? this.o.staticMaxStep : ts.fastest);
    const step: StepInfo = { kind: "transient", t: this.time, dt: dt0, method: "be", gmin: GMIN, sourceScale: 1 };
    const x = this.solveAt(step, this.x, 0, this.o.maxNewtonIterations * 2);
    if (!x) throw new SolveFailure();
    this.acceptAll(x, step);
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
      dig.senseAll(x);
      if (!dig.run(this.time)) return x;
      x = this.solveHere();
    }
    throw new DigitalOscillation([], this.time);
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
    this.ring.push(this.time, this.display);
    this.recordSample();
  }

  private recordSample(): void {
    if (this.sampling && this.channels.length > 0) this.samples.push(this.time, this.channelValues);
  }

  private handleSolveError(e: unknown): void {
    if (e instanceof SingularError) this.stop(singularDiagnostic(this.c, e.row, this.time));
    else if (e instanceof SolveFailure) this.stop(noConvergenceDiagnostic(this.c, this.time));
    else if (e instanceof DigitalOscillation) this.stop(digitalOscillationDiagnostic(e.elements, e.t));
    else throw e;
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
    const next = [...this.solverDiags, ...this.configDiags];
    if (JSON.stringify(next) !== JSON.stringify(this.diagnostics)) {
      this.diagnostics = next;
      this.diagnosticsVersion++;
    }
  }

  private refreshTimeScales(): void {
    this.timeScales = computeTimeScales(this.c, this.x, this.time);
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
    let lim = ts.kind === "static" ? this.o.staticMaxStep : ts.fastest / 50;
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
      const step = this.info("transient", dt, GMIN, 1, method);
      const x = this.solveAt(step, this.x, 0, this.o.maxNewtonIterations);
      if (!x) {
        if (halvings < MAX_HALVINGS) {
          halvings++;
          dt /= 2;
          proposal = dt;
          continue;
        }
        this.stop(noConvergenceDiagnostic(c, step.t));
        return { ok: false, t: this.time, dt: 0, breakpoint: false };
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
      this.ring.push(this.time, display);
      this.recordSample();
      const grow = ratio > 0 ? Math.min(2, 0.9 * pow(ratio, -1 / 3)) : 2;
      this.dtNext = hitBp || hitDig || refined ? Math.min(proposal, limit) : Math.min(dt * grow, limit);
      this.beLeft = hitBp ? this.o.beSteps : Math.max(0, this.beLeft - 1);
      if (this.dig) {
        // Events due now; a changed bridge is a discontinuity, so restart with BE.
        const x2 = this.syncDigital(x);
        if (x2 !== x) {
          this.commitSolution(x2);
          this.beLeft = this.o.beSteps;
          hitBp = true;
        }
        hitBp ||= hitDig;
      }
      if (++this.sinceCheckpoint >= this.o.checkpointInterval) this.pushCheckpoint();
      let pause: PauseCondition | undefined;
      if (hit) {
        pause = hit.cond;
        this.events.push({ t: this.time, kind: "pauseCondition", detail: hit.cond.id });
      }
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
        c.branchOwner.forEach((owner, k) => {
          if (owner !== i) return;
          const u = c.nodeCount + 1 + k;
          mag = Math.max(mag, Math.abs(x[u]), Math.abs(this.x[u]));
        });
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
    if (++this.sinceCheckpoint >= this.o.checkpointInterval) this.pushCheckpoint();
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
    };
  }

  private restoreCheckpoint(cp: Checkpoint): void {
    loadAllStates(this.c, cp.states);
    this.time = cp.t;
    this.x = cp.x.slice();
    this.dtNext = cp.dtNext;
    this.beLeft = cp.beLeft;
    if (this.dig && cp.digital) this.dig.restore(cp.digital);
    fillDisplay(this.c, this.x, this.display);
    this.channels.evaluate(this.display, this.channelValues);
  }

  private pushCheckpoint(): void {
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
