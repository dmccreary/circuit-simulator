// Channels (simulation-engine.md §7.3): recorded quantities evaluated from the
// display state at every accepted step.

import type { ChannelSpec } from "@cs/model";
import type { Circuit } from "./circuit";

type Evaluator = (d: Float64Array) => number;

function evaluator(spec: ChannelSpec, c: Circuit): Evaluator {
  const nodeOk = (n: number) => Number.isInteger(n) && n >= 0 && n <= c.nodeCount;
  const curBase = c.nodeCount + 1;
  switch (spec.kind) {
    case "voltage": {
      const { a, b } = spec;
      if (!nodeOk(a) || !nodeOk(b)) return () => NaN;
      return (d) => d[a] - d[b];
    }
    case "current": {
      const i = c.idIndex.get(spec.element);
      if (i === undefined) return () => NaN;
      const nTerm = c.termOffsets[i + 1] - c.termOffsets[i];
      if (spec.terminal < 0 || spec.terminal >= nTerm) return () => NaN;
      const at = curBase + c.termOffsets[i] + spec.terminal;
      return (d) => d[at];
    }
    case "power": {
      const i = c.idIndex.get(spec.element);
      if (i === undefined) return () => NaN;
      const nodes = c.netlist.elements[i].nodes;
      const at = curBase + c.termOffsets[i];
      return (d) => {
        let p = 0;
        for (let k = 0; k < nodes.length; k++) p += d[nodes[k]] * d[at + k];
        return p;
      };
    }
    case "logic": {
      // TODO(digital kernel): report the net's logic state; until then, its voltage.
      const n = spec.node;
      if (!nodeOk(n)) return () => NaN;
      return (d) => d[n];
    }
  }
}

export class ChannelSet {
  readonly ids: string[];
  private readonly evals: Evaluator[];

  constructor(readonly specs: ChannelSpec[], c: Circuit) {
    this.ids = specs.map((s) => s.id);
    this.evals = specs.map((s) => evaluator(s, c));
  }

  get length(): number {
    return this.evals.length;
  }

  indexOf(id: string): number {
    return this.ids.indexOf(id);
  }

  evaluate(display: Float64Array, out: Float64Array): void {
    for (let k = 0; k < this.evals.length; k++) out[k] = this.evals[k](display);
  }
}

export interface SampleBlock {
  channelIds: string[];
  times: Float64Array;
  /** Channel-major: samples[c * n + i]. */
  samples: Float64Array;
}

export class SampleBuffer {
  private times: number[] = [];
  private cols: number[][];

  constructor(readonly channelIds: string[]) {
    this.cols = channelIds.map(() => []);
  }

  get length(): number {
    return this.times.length;
  }

  push(t: number, values: Float64Array): void {
    this.times.push(t);
    for (let k = 0; k < this.cols.length; k++) this.cols[k].push(values[k]);
  }

  drain(): SampleBlock {
    const n = this.times.length;
    const samples = new Float64Array(n * this.cols.length);
    this.cols.forEach((col, k) => samples.set(col, k * n));
    const block = { channelIds: this.channelIds.slice(), times: Float64Array.from(this.times), samples };
    this.times = [];
    this.cols = this.channelIds.map(() => []);
    return block;
  }
}
