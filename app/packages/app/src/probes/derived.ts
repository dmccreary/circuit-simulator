// Wire-segment current probes whose current is a sum of several terminal
// currents (a segment between two junctions) cannot be expressed as one
// engine ChannelSpec yet. Until a `sum` channel kind exists, the main thread
// adds them to every frame as derived channels, computed from the frame's
// display state and interpolated across the frame's sample times, so the
// chart, the history store and the flags see them like any other channel.

import type { CircuitDocument, CompiledCircuit } from "@cs/model";
import type { Frame } from "@cs/worker";
import { segmentSumTerms, terminalCurrent, type LiveSource } from "./evaluate";

export interface DerivedChannel {
  id: string;
  terms: { element: string; terminal: number; sign: number }[];
}

/** Current probes that need a derived channel in this compiled circuit. */
export function derivedChannels(doc: CircuitDocument, cc: CompiledCircuit | undefined): DerivedChannel[] {
  if (!cc) return [];
  const out: DerivedChannel[] = [];
  for (const p of Object.values(doc.probes)) {
    if (p.quantity !== "current" || cc.channels[p.id]) continue;
    const sum = segmentSumTerms(cc, p.target);
    if (!sum) continue;
    const s = sum.reversed ? -1 : 1;
    out.push({ id: p.id, terms: sum.terms.map((t) => ({ ...t, sign: t.sign * s })) });
  }
  return out;
}

export function derivedValue(src: LiveSource, ch: DerivedChannel): number {
  let v = 0;
  for (const t of ch.terms) v += t.sign * (terminalCurrent(src, t.element, t.terminal) ?? 0);
  return v;
}

/**
 * A frame transform that appends derived channels. `get` returns the current
 * document and compilation; the previous value per channel is remembered so
 * samples inside a frame ramp from the last frame's value to this one's.
 */
export function createDerivedTransform(get: () => { doc: CircuitDocument; compiled: CompiledCircuit | undefined }) {
  const last = new Map<string, { t: number; v: number }>();
  return (f: Frame): Frame => {
    const { doc, compiled } = get();
    const chans = derivedChannels(doc, compiled).filter((c) => !f.channelIds.includes(c.id));
    if (!compiled || chans.length === 0) return f;
    const src: LiveSource = { compiled, display: f.display };
    const n = f.times.length;
    const ids = [...f.channelIds];
    const samples = new Float64Array((ids.length + chans.length) * n);
    samples.set(f.samples.subarray(0, ids.length * n));
    chans.forEach((ch, k) => {
      const v1 = derivedValue(src, ch);
      const prev = last.get(ch.id);
      const usable = prev && prev.t <= f.t0 && f.t1 > prev.t;
      const off = (ids.length + k) * n;
      for (let i = 0; i < n; i++) {
        const t = f.times[i];
        samples[off + i] = usable ? prev.v + ((v1 - prev.v) * (t - prev.t)) / (f.t1 - prev.t) : v1;
      }
      last.set(ch.id, { t: f.t1, v: v1 });
      ids.push(ch.id);
    });
    return { ...f, channelIds: ids, samples };
  };
}
