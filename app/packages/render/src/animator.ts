import type { CompiledCircuit, Part, Point } from "@cs/model";
import { terminalCurrentOffsets } from "@cs/model";
import type { ElementView } from "@cs/elements";
import type { ViewTransform } from "./transform";
import type { Theme } from "./theme";
import { AutoScale, DOT_SPACING, SPEED_CAP, TRICKLE_SPEED, frac, phaseDelta, pointAlong, pointAlongInto, polylineLength } from "./dots";

/** One drawn path that carries dots: a wire segment or a path inside a part. */
export interface DotPath {
  key: string;
  points: Point[]; // document grid coordinates
  /** Current from points[0] toward the end = Σ sign × display[index]. */
  terms: { index: number; sign: number }[];
}

export interface DotPathSources {
  parts: Record<string, Part>;
  getView(type: string): ElementView | undefined;
  localToDocument(part: Part, p: Point): Point;
}

/** Map compiled segments and part current paths onto display-state indexes (rendering.md §3.2). */
export function buildDotPaths(compiled: CompiledCircuit, src: DotPathSources): DotPath[] {
  const { netlist } = compiled;
  const base = netlist.nodeCount + 1;
  const offs = terminalCurrentOffsets(netlist);
  const elIndex = new Map<string, number>();
  netlist.elements.forEach((el, i) => elIndex.set(el.id, i));
  const termIndex = (element: string, terminal: number): number | undefined => {
    const i = elIndex.get(element);
    return i === undefined ? undefined : base + offs[i] + terminal;
  };

  const out: DotPath[] = [];
  for (const s of compiled.segments) {
    const terms: DotPath["terms"] = [];
    for (const t of s.terms) {
      const index = termIndex(t.element, t.terminal);
      if (index !== undefined) terms.push({ index, sign: t.sign });
    }
    out.push({ key: `w:${s.wire}:${s.segment}`, points: [s.from, s.to], terms });
  }
  for (const part of Object.values(src.parts)) {
    const view = src.getView(part.type);
    if (!view || !elIndex.has(part.id)) continue;
    view.currentPaths(part).forEach((p, n) => {
      const index = termIndex(part.id, p.from);
      if (index === undefined) return;
      out.push({
        key: `p:${part.id}:${n}`,
        points: p.points.map((q) => src.localToDocument(part, q)),
        terms: [{ index, sign: 1 }],
      });
    });
  }
  return out;
}

export function pathCurrent(path: DotPath, display: ArrayLike<number>): number {
  let i = 0;
  for (const t of path.terms) i += t.sign * (display[t.index] ?? 0);
  return Number.isFinite(i) ? i : 0;
}

/**
 * Owns one phase per drawn path (rendering.md §3). Phases advance with REAL
 * elapsed time while running — never scaled by simulation speed (ANI-03).
 */
export class CurrentAnimator {
  private paths: DotPath[] = [];
  private lengths: number[] = [];
  /** Phase per path, by index; carried over by key when the paths change. */
  private phases = new Float64Array(0);
  private currents = new Float64Array(0);
  /** Scratch point for drawing (no per-dot allocation). */
  private readonly pt = { x: 0, y: 0 };
  private auto = new AutoScale();
  running = false;
  reducedMotion = false;
  electronFlow = false;
  /** Fixed k (grid units per second per amp); undefined = Auto. */
  fixedK: number | undefined;
  enabled = true;

  setPaths(paths: DotPath[]): void {
    const old = new Map<string, number>();
    this.paths.forEach((p, i) => old.set(p.key, this.phases[i]));
    this.paths = paths;
    this.lengths = paths.map((p) => polylineLength(p.points));
    this.phases = Float64Array.from(paths, (p) => old.get(p.key) ?? 0);
    this.currents = new Float64Array(paths.length);
  }

  setDisplay(display: ArrayLike<number> | undefined): void {
    const cur = this.currents;
    for (let i = 0; i < this.paths.length; i++) cur[i] = display ? pathCurrent(this.paths[i], display) : 0;
  }

  /** Phase of a path by key (tests, inspection). */
  phaseOf(key: string): number {
    const i = this.paths.findIndex((p) => p.key === key);
    return i < 0 ? 0 : this.phases[i];
  }

  get k(): number {
    return this.fixedK ?? this.auto.k;
  }

  /** Scheduler ticker. Returns true while dots move. */
  tick = (dt: number, now: number): boolean => {
    if (!this.enabled) return false;
    let max = 0;
    for (const c of this.currents) max = Math.max(max, Math.abs(c));
    this.auto.update(max, now);
    if (!this.running || this.reducedMotion) return false;
    this.advance(dt);
    return this.moving();
  };

  /** Paused, stepping, or scrubbing: move by the simulated-time change at the present speed (ANI-09). */
  advanceSimulated(dtSim: number, simSpeed: number): void {
    if (simSpeed > 0) this.advance(dtSim / simSpeed);
  }

  resetPhases(): void {
    this.phases.fill(0);
    this.auto.reset();
  }

  private moving(): boolean {
    const k = this.k;
    for (let i = 0; i < this.currents.length; i++) if (Math.abs(k * this.currents[i]) >= TRICKLE_SPEED) return true;
    return false;
  }

  private advance(dt: number): void {
    const k = this.k;
    const dir = this.electronFlow ? -1 : 1;
    for (let i = 0; i < this.paths.length; i++) {
      const d = phaseDelta(dir * this.currents[i], k, dt);
      if (d !== 0) this.phases[i] += d;
    }
  }

  /**
   * Every frame while dots move: all dots go into one path and one fill, all
   * streaks into one stroke, with no allocation per dot (rendering.md §2.2).
   */
  draw(ctx: CanvasRenderingContext2D, view: ViewTransform, theme: Theme): void {
    if (!this.enabled) return;
    const k = this.k;
    const s = view.scale;
    const ox = view.offsetX;
    const oy = view.offsetY;
    const r = Math.max(1.5, Math.min(3.5, 0.14 * s));
    ctx.fillStyle = theme.dot;
    ctx.strokeStyle = theme.dot;
    const dir = this.electronFlow ? -1 : 1;
    const q = this.pt;
    if (this.reducedMotion) {
      this.paths.forEach((p, i) => {
        const speed = dir * k * this.currents[i];
        const len = this.lengths[i];
        if (Math.abs(speed) >= TRICKLE_SPEED && len > 0) drawArrow(ctx, view, p.points, len, Math.sign(speed), Math.min(1, Math.abs(speed) / 8));
      });
      return;
    }
    // Pass 0: round dots (one fill). Pass 1: streaks (one stroke).
    for (let pass = 0; pass < 2; pass++) {
      let any = false;
      ctx.beginPath();
      for (let i = 0; i < this.paths.length; i++) {
        const speed = dir * k * this.currents[i];
        const len = this.lengths[i];
        if (Math.abs(speed) < TRICKLE_SPEED || len <= 0) continue;
        const streak = Math.abs(speed) >= SPEED_CAP;
        if (streak !== (pass === 1)) continue;
        const pts = this.paths[i].points;
        const f = frac(this.phases[i]);
        for (let n = 0; (n + f) * DOT_SPACING <= len + 1e-9; n++) {
          const d = (n + f) * DOT_SPACING;
          pointAlongInto(pts, d, q);
          const x = q.x * s + ox;
          const y = q.y * s + oy;
          if (streak) {
            pointAlongInto(pts, Math.max(0, d - 0.4 * Math.sign(speed)), q);
            ctx.moveTo(q.x * s + ox, q.y * s + oy);
            ctx.lineTo(x, y);
          } else {
            ctx.moveTo(x + r, y);
            ctx.arc(x, y, r, 0, Math.PI * 2);
          }
          any = true;
        }
      }
      if (!any) continue;
      if (pass === 0) ctx.fill();
      else {
        ctx.lineWidth = r * 1.4;
        ctx.lineCap = "round";
        ctx.stroke();
      }
    }
  }
}

/** Static arrow at the middle of a path, for reduced motion (ACC-13). */
function drawArrow(ctx: CanvasRenderingContext2D, view: ViewTransform, pts: Point[], len: number, sign: number, size: number): void {
  const mid = pointAlong(pts, len / 2);
  const ahead = pointAlong(pts, Math.min(len, len / 2 + 0.1 * sign));
  const behind = pointAlong(pts, Math.max(0, len / 2 - 0.1 * sign));
  const a = view.toScreen(ahead);
  const b = view.toScreen(behind);
  const m = view.toScreen(mid);
  const ang = Math.atan2(a.y - b.y, a.x - b.x);
  const L = (4 + 6 * size) * Math.min(2, view.zoom);
  ctx.beginPath();
  ctx.moveTo(m.x + Math.cos(ang) * L, m.y + Math.sin(ang) * L);
  ctx.lineTo(m.x + Math.cos(ang + 2.5) * L, m.y + Math.sin(ang + 2.5) * L);
  ctx.lineTo(m.x + Math.cos(ang - 2.5) * L, m.y + Math.sin(ang - 2.5) * L);
  ctx.closePath();
  ctx.fill();
}
