// Frequency-tab extras: the impedance view (ANL-13), "Try this frequency"
// (ANL-14) and phasors (ANL-16). Jobs reuse the AC analysis: impedance is
// V ÷ I of the chosen part, phasors are one frequency of the response to the
// sources' own AC magnitudes and phases.

import type { ChannelSpec, CompiledCircuit, Netlist } from "@cs/model";
import type { AnalysisJob } from "@cs/engine";
import type { AppController } from "../controller";

/** Complex division (a + jb) / (c + jd). */
export function cdiv(a: number, b: number, c: number, d: number): [number, number] {
  const den = c * c + d * d;
  return den === 0 ? [NaN, NaN] : [(a * c + b * d) / den, (b * c - a * d) / den];
}

export const magnitude = (re: number, im: number) => Math.hypot(re, im);
export const degrees = (re: number, im: number) => (Math.atan2(im, re) * 180) / Math.PI;

/** Channels for a part's impedance: voltage across terminals 0–1 and current into terminal 0. */
export function impedanceOutputs(cc: CompiledCircuit, part: string): ChannelSpec[] | undefined {
  const el = cc.netlist.elements.find((e) => e.id === part);
  if (!el || el.nodes.length !== 2) return undefined;
  return [
    { id: "__zv", kind: "voltage", a: el.nodes[0], b: el.nodes[1] },
    { id: "__zi", kind: "current", element: part, terminal: 0 },
  ];
}

/**
 * Impedance per frequency from the two outputs. A source sees the rest of the
 * circuit: Z = V ÷ (current out of its + terminal) = −V ÷ I_into+.
 */
export function impedanceFrom(v: { re: number[]; im: number[] }, i: { re: number[]; im: number[] }, isSource: boolean): { mag: number[]; deg: number[] } {
  const mag: number[] = [];
  const deg: number[] = [];
  for (let k = 0; k < v.re.length; k++) {
    const s = isSource ? -1 : 1;
    const [zr, zi] = cdiv(v.re[k], v.im[k], s * i.re[k], s * i.im[k]);
    mag.push(magnitude(zr, zi));
    deg.push(degrees(zr, zi));
  }
  return { mag, deg };
}

/** Sine sources' amplitude and phase as their AC stimulus, unless an AC magnitude is already set. */
export function phasorNetlist(n: Netlist): Netlist {
  return {
    ...n,
    elements: n.elements.map((el) => {
      if (el.type !== "ac-source") return el;
      const mag = typeof el.props.acMagnitude === "number" ? el.props.acMagnitude : 0;
      if (mag !== 0) return el;
      return { ...el, props: { ...el.props, acMagnitude: Number(el.props.amplitude ?? 0), acPhase: Number(el.props.phase ?? 0) } };
    }),
  };
}

/** The frequency of the first sine source, for the phasor view's default. */
export function sineFrequency(n: Netlist): number | undefined {
  const el = n.elements.find((e) => e.type === "ac-source");
  const f = el ? Number(el.props.frequency) : NaN;
  return Number.isFinite(f) && f > 0 ? f : undefined;
}

export function phasorJob(n: Netlist, outputs: ChannelSpec[], frequency: number): AnalysisJob {
  return { kind: "ac", netlist: phasorNetlist(n), outputs, freqs: { start: frequency, stop: frequency, scale: "linear", points: 2 } };
}

/**
 * ANL-14: make the input a sine at `f` and show it in the time view with a
 * window of about five periods. Only sine sources (ac-source) can take a
 * frequency; returns false otherwise.
 */
export function tryFrequency(c: AppController, input: string, f: number, close: () => void): boolean {
  const part = c.edits.doc.parts[input];
  if (!part || part.type !== "ac-source" || !(f > 0)) return false;
  c.edits.edit({ key: "edit.setValue", values: { prop: "frequency" } }, (d) => {
    d.parts[input].props.frequency = Number(f.toPrecision(3));
  });
  close();
  c.chartSession.setSpan(5 / f);
  return true;
}
