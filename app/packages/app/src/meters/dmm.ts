// Virtual digital multimeter (PRB-24): readings between a red and a black
// lead. Volts come from the live display state (DC = average, AC = true RMS of
// the AC part over the recent frames); ohms, diode test and continuity inject
// a 1 mA test current into an unpowered circuit through the analysis worker.

import type { Netlist } from "@cs/model";
import { formatValue, type Unit } from "@cs/units";
import type { LiveSource } from "../probes/evaluate";
import { nodeVoltage } from "../probes/evaluate";

export const TEST_CURRENT = 1e-3;
export const OPEN_OHMS = 40e6;
export const CONTINUITY_OHMS = 50;

/** Recent lead-voltage samples (sim time, volts). */
export class LeadSampler {
  private t: number[] = [];
  private v: number[] = [];
  constructor(private max = 256) {}

  push(t: number, v: number): void {
    const n = this.t.length;
    if (n && t < this.t[n - 1]) this.clear(); // reset or restart
    if (n && t === this.t[n - 1]) {
      this.v[n - 1] = v;
      return;
    }
    this.t.push(t);
    this.v.push(v);
    if (this.t.length > this.max) {
      this.t.shift();
      this.v.shift();
    }
  }

  clear(): void {
    this.t = [];
    this.v = [];
  }

  get length(): number {
    return this.t.length;
  }

  /** Time-weighted mean and RMS of the deviation from it (trapezoids). */
  stats(): { mean: number; acRms: number } | undefined {
    const n = this.t.length;
    if (n === 0) return undefined;
    if (n === 1 || this.t[n - 1] === this.t[0]) return { mean: this.v[n - 1], acRms: 0 };
    let area = 0;
    for (let i = 1; i < n; i++) area += ((this.v[i] + this.v[i - 1]) / 2) * (this.t[i] - this.t[i - 1]);
    const span = this.t[n - 1] - this.t[0];
    const mean = area / span;
    let sq = 0;
    for (let i = 1; i < n; i++) {
      const a = this.v[i - 1] - mean;
      const b = this.v[i] - mean;
      sq += ((a * a + a * b + b * b) / 3) * (this.t[i] - this.t[i - 1]);
    }
    return { mean, acRms: Math.sqrt(Math.max(0, sq / span)) };
  }
}

/** Four significant digits with automatic ranging: "4.502 V", "12.00 kΩ". */
export function dmmText(v: number | undefined, unit: Unit): string {
  if (v === undefined || !Number.isFinite(v)) return "– – –";
  return formatValue(v, unit, { digits: 4 });
}

/** A circuit with any voltage or current is powered; ohms then refuses to read. */
export function isPowered(src: LiveSource | undefined): boolean {
  if (!src) return false;
  const d = src.display;
  for (let i = 1; i < d.length; i++) {
    const x = Math.abs(d[i] ?? 0);
    if (x > (i <= src.compiled.netlist.nodeCount ? 1e-6 : 1e-9)) return true;
  }
  return false;
}

export function leadVoltage(src: LiveSource, red: number, black: number): number {
  return nodeVoltage(src, red) - nodeVoltage(src, black);
}

/** The netlist with the meter's test current source: 1 mA out of the red lead, back in at the black. */
export function ohmmeterNetlist(n: Netlist, red: number, black: number): Netlist {
  // current-source: current flows into terminal 0 ("in"), through the source, out of terminal 1 ("out").
  const el = { id: "__dmm", type: "current-source", nodes: [black, red], props: { current: TEST_CURRENT } };
  return { ...n, elements: [...n.elements, el] };
}

/** Ohms from the solved lead voltage; Infinity means open (OL). */
export function ohmsFrom(vLeads: number): number {
  const r = vLeads / TEST_CURRENT;
  return !Number.isFinite(r) || Math.abs(r) > OPEN_OHMS ? Infinity : r;
}
