// Frequency response (ANL-08–13, history-and-analysis.md §5.3): find the DC
// operating point, ask every element for its small-signal stamps, then solve
// the complex system once per frequency.

import type { ChannelSpec, ElementId, Netlist } from "@cs/model";
import type { ComplexStamper, ElementModel, StepInfo } from "@cs/elements";
import { pow } from "@cs/dmath";
import { VectorView, type Circuit, type FactoryLookup } from "../circuit";
import { operatingPoint } from "./dc-op";
import { solveComplex } from "./lu";
import { withProps, type PropOverride } from "./netlist-edit";
import { ComplexSystem, RecordingStamper, realMatrixOnly } from "./systems";
import type { AcResult, AnalysisProgress, FreqRange } from "./types";

/** Frequencies of a sweep: log spaced with points per decade (default 50), or linear. */
export function frequencyGrid(r: FreqRange): number[] {
  const start = Math.max(1e-6, Math.min(r.start, r.stop));
  const stop = Math.max(r.start, r.stop, start);
  if (r.scale === "linear") {
    const n = Math.max(2, Math.round(r.points ?? 200));
    return Array.from({ length: n }, (_, i) => start + ((stop - start) * i) / (n - 1));
  }
  const ppd = Math.max(1, Math.round(r.pointsPerDecade ?? 50));
  const decades = Math.log10(stop / start);
  const n = Math.max(2, Math.round(decades * ppd) + 1);
  return Array.from({ length: n }, (_, i) => start * pow(10, (decades * i) / (n - 1)));
}

/**
 * Make `input` the only AC stimulus: 1 V (or 1 A) at 0°. With no input, the
 * sources' own acMagnitude / acPhase props are used as they are.
 */
export function stimulusNetlist(netlist: Netlist, input: ElementId | undefined): Netlist {
  if (!input) return netlist;
  const overrides: PropOverride[] = [];
  for (const el of netlist.elements) {
    overrides.push({ element: el.id, key: "acMagnitude", value: el.id === input ? 1 : 0 });
    if (el.id === input) overrides.push({ element: el.id, key: "acPhase", value: 0 });
  }
  return withProps(netlist, overrides);
}

function acStep(omega: number): StepInfo {
  return { kind: "ac", t: 0, dt: 0, method: "be", gmin: 1e-12, sourceScale: 1, omega };
}

/** One element's small-signal stamp, or the real "ac"-kind stamps for models without stampAC. */
export function stampElementAC(m: ElementModel, s: ComplexStamper, op: VectorView, omega: number): void {
  if (m.stampAC) {
    m.stampAC(s, op, omega);
    return;
  }
  const r = realMatrixOnly(s);
  const step = acStep(omega);
  m.stampStatic?.(r);
  m.stampStep?.(r, step);
  if (m.nonlinear) m.stampNewton?.(r, op, step);
}

type Reader = (xr: Float64Array, xi: Float64Array) => [number, number];

/** How to read one output channel from a complex solution. */
function outputReader(spec: ChannelSpec, c: Circuit, op: VectorView, omega: () => number): Reader {
  const nan: Reader = () => [NaN, NaN];
  switch (spec.kind) {
    case "voltage": {
      const { a, b } = spec;
      if (a < 0 || a > c.nodeCount || b < 0 || b > c.nodeCount) return nan;
      return (xr, xi) => [xr[a] - xr[b], xi[a] - xi[b]];
    }
    case "current": {
      const i = c.idIndex.get(spec.element);
      const m = i === undefined ? null : c.models[i];
      if (i === undefined || !m) return nan;
      const nodes = c.netlist.elements[i].nodes;
      const k = spec.terminal;
      if (k < 0 || k >= nodes.length) return nan;
      return (xr, xi) => {
        const rec = new RecordingStamper();
        stampElementAC(m, rec, op, omega());
        const into = (t: number) => rec.residual(nodes[t], xr, xi);
        const unique = (t: number) => nodes[t] > 0 && nodes.filter((n) => n === nodes[t]).length === 1;
        if (unique(k)) return into(k);
        // Terminal on ground (or shared): Kirchhoff over the other terminals.
        let re = 0;
        let im = 0;
        for (let t = 0; t < nodes.length; t++) {
          if (t === k) continue;
          if (!unique(t)) return [NaN, NaN];
          const [r, j] = into(t);
          re -= r;
          im -= j;
        }
        return [re, im];
      };
    }
    default:
      return nan;
  }
}

export interface AcJob {
  netlist: Netlist;
  input?: ElementId;
  outputs: ChannelSpec[];
  freqs: FreqRange | number[];
}

/** Frequency response; a generator so a worker can interleave cancellation between chunks. */
export function* acAnalysis(job: AcJob, lookup: FactoryLookup): Generator<AnalysisProgress, AcResult> {
  const freqs = Array.isArray(job.freqs) ? job.freqs : frequencyGrid(job.freqs);
  const op = operatingPoint(stimulusNetlist(job.netlist, job.input), lookup);
  const c = op.circuit;
  const approximated = [...new Set(c.netlist.elements.filter((_, i) => c.models[i] && !c.models[i]!.stampAC).map((el) => el.type))];
  const result: AcResult = {
    kind: "ac",
    ok: !!op.x,
    error: op.error,
    freqs: [],
    outputs: job.outputs.map((o) => ({ id: o.id, re: [], im: [] })),
    nonlinear: c.nonlinear,
    approximated,
  };
  if (!op.x) return result;
  const view = new VectorView(op.x);
  let omega = 0;
  const readers = job.outputs.map((o) => outputReader(o, c, view, () => omega));
  const sys = new ComplexSystem(c.size);
  const xr = new Float64Array(c.size + 1);
  const xi = new Float64Array(c.size + 1);
  const chunk = 25;
  for (let fi = 0; fi < freqs.length; fi++) {
    omega = 2 * Math.PI * freqs[fi];
    sys.clear();
    for (const m of c.models) if (m) stampElementAC(m, sys, view, omega);
    for (let u = 1; u <= c.nodeCount; u++) sys.matrix(u, u, 1e-12, 0);
    for (const n of c.idleNodes) sys.matrix(n, n, 1e-12, 0);
    const br = Float64Array.from(sys.br);
    const bi = Float64Array.from(sys.bi);
    let ok = true;
    try {
      if (c.size > 0) solveComplex(Float64Array.from(sys.Ar), Float64Array.from(sys.Ai), br, bi, c.size);
    } catch {
      ok = false;
    }
    xr.set(br, 1);
    xi.set(bi, 1);
    result.freqs.push(freqs[fi]);
    readers.forEach((read, k) => {
      const [re, im] = ok ? read(xr, xi) : [NaN, NaN];
      result.outputs[k].re.push(re);
      result.outputs[k].im.push(im);
    });
    if ((fi + 1) % chunk === 0 && fi + 1 < freqs.length) yield { fraction: (fi + 1) / freqs.length, partial: result };
  }
  return result;
}

/** Magnitude in dB and phase in degrees of a phasor. */
export function toBode(re: number, im: number): { db: number; deg: number } {
  return { db: 20 * Math.log10(Math.hypot(re, im)), deg: (Math.atan2(im, re) * 180) / Math.PI };
}
