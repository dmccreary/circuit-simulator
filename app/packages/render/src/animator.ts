import type { CompiledCircuit, Part, Point } from "@cs/model";
import { terminalCurrentOffsets } from "@cs/model";
import type { ElementView } from "@cs/elements";
import type { ViewTransform } from "./transform";
import type { Theme } from "./theme";
import { AutoScale, DOT_SPACING, SPEED_CAP, TRICKLE_SPEED, dotOffsets, phaseDelta, pointAlong, polylineLength } from "./dots";

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
  private phases = new Map<string, number>();
  private currents: number[] = [];
  private auto = new AutoScale();
  running = false;
  reducedMotion = false;
  electronFlow = false;
  /** Fixed k (grid units per second per amp); undefined = Auto. */
  fixedK: number | undefined;
  enabled = true;

  setPaths(paths: DotPath[]): void {
    this.paths = paths;
    this.lengths = paths.map((p) => polylineLength(p.points));
    const keep = new Set(paths.map((p) => p.key));
    for (const k of [...this.phases.keys()]) if (!keep.has(k)) this.phases.delete(k);
    this.currents = paths.map(() => 0);
  }

  setDisplay(display: ArrayLike<number> | undefined): void {
    this.currents = this.paths.map((p) => (display ? pathCurrent(p, display) : 0));
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
    this.phases.clear();
    this.auto.reset();
  }

  private moving(): boolean {
    const k = this.k;
    return this.currents.some((c) => Math.abs(k * c) >= TRICKLE_SPEED);
  }

  private advance(dt: number): void {
    const k = this.k;
    const dir = this.electronFlow ? -1 : 1;
    this.paths.forEach((p, i) => {
      const d = phaseDelta(dir * this.currents[i], k, dt);
      if (d !== 0) this.phases.set(p.key, (this.phases.get(p.key) ?? 0) + d);
    });
  }

  draw(ctx: CanvasRenderingContext2D, view: ViewTransform, theme: Theme): void {
    if (!this.enabled) return;
    const k = this.k;
    const s = view.scale;
    const r = Math.max(1.5, Math.min(3.5, 0.14 * s));
    ctx.fillStyle = theme.dot;
    ctx.strokeStyle = theme.dot;
    const dir = this.electronFlow ? -1 : 1;
    this.paths.forEach((p, i) => {
      const speed = dir * k * this.currents[i];
      if (Math.abs(speed) < TRICKLE_SPEED) return;
      const len = this.lengths[i];
      if (len <= 0) return;
      if (this.reducedMotion) {
        drawArrow(ctx, view, p.points, len, Math.sign(speed), Math.min(1, Math.abs(speed) / 8));
        return;
      }
      const streak = Math.abs(speed) >= SPEED_CAP;
      for (const d of dotOffsets(this.phases.get(p.key) ?? 0, len, DOT_SPACING)) {
        const q = view.toScreen(pointAlong(p.points, d));
        if (streak) {
          const back = view.toScreen(pointAlong(p.points, Math.max(0, d - 0.4 * Math.sign(speed))));
          ctx.lineWidth = r * 1.4;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(back.x, back.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
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
