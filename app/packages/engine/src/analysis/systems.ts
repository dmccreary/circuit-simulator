// Real and complex MNA assemblies for the analysis service. Unknown u
// (1-based; 0 = ground) lives at matrix row/column u - 1, as in the engine.

import type { ComplexStamper, Stamper, UnknownIndex } from "@cs/elements";
import type { NodeIndex } from "@cs/model";

export class RealSystem implements Stamper {
  readonly A: Float64Array;
  readonly b: Float64Array;

  constructor(readonly size: number) {
    this.A = new Float64Array(size * size);
    this.b = new Float64Array(size);
  }

  clear(): void {
    this.A.fill(0);
    this.b.fill(0);
  }

  matrix(row: UnknownIndex, col: UnknownIndex, value: number): void {
    if (row <= 0 || col <= 0) return;
    this.A[(row - 1) * this.size + (col - 1)] += value;
  }

  rhs(row: UnknownIndex, value: number): void {
    if (row <= 0) return;
    this.b[row - 1] += value;
  }

  conductance(a: NodeIndex, b: NodeIndex, g: number): void {
    this.matrix(a, a, g);
    this.matrix(b, b, g);
    this.matrix(a, b, -g);
    this.matrix(b, a, -g);
  }

  current(a: NodeIndex, b: NodeIndex, i: number): void {
    this.rhs(a, -i);
    this.rhs(b, i);
  }

  voltageSource(branch: UnknownIndex, plus: NodeIndex, minus: NodeIndex, v: number): void {
    this.matrix(plus, branch, 1);
    this.matrix(minus, branch, -1);
    this.matrix(branch, plus, 1);
    this.matrix(branch, minus, -1);
    this.rhs(branch, v);
  }
}

/** Shared complex stamping helpers on top of matrix() and rhs(). */
export abstract class ComplexStamperBase implements ComplexStamper {
  abstract matrix(row: UnknownIndex, col: UnknownIndex, re: number, im: number): void;
  abstract rhs(row: UnknownIndex, re: number, im: number): void;

  admittance(a: NodeIndex, b: NodeIndex, re: number, im: number): void {
    this.matrix(a, a, re, im);
    this.matrix(b, b, re, im);
    this.matrix(a, b, -re, -im);
    this.matrix(b, a, -re, -im);
  }

  current(a: NodeIndex, b: NodeIndex, re: number, im: number): void {
    this.rhs(a, -re, -im);
    this.rhs(b, re, im);
  }

  voltageSource(branch: UnknownIndex, plus: NodeIndex, minus: NodeIndex, re: number, im: number): void {
    this.matrix(plus, branch, 1, 0);
    this.matrix(minus, branch, -1, 0);
    this.matrix(branch, plus, 1, 0);
    this.matrix(branch, minus, -1, 0);
    this.rhs(branch, re, im);
  }
}

export class ComplexSystem extends ComplexStamperBase {
  readonly Ar: Float64Array;
  readonly Ai: Float64Array;
  readonly br: Float64Array;
  readonly bi: Float64Array;

  constructor(readonly size: number) {
    super();
    this.Ar = new Float64Array(size * size);
    this.Ai = new Float64Array(size * size);
    this.br = new Float64Array(size);
    this.bi = new Float64Array(size);
  }

  clear(): void {
    this.Ar.fill(0);
    this.Ai.fill(0);
    this.br.fill(0);
    this.bi.fill(0);
  }

  matrix(row: UnknownIndex, col: UnknownIndex, re: number, im: number): void {
    if (row <= 0 || col <= 0) return;
    const k = (row - 1) * this.size + (col - 1);
    this.Ar[k] += re;
    this.Ai[k] += im;
  }

  rhs(row: UnknownIndex, re: number, im: number): void {
    if (row <= 0) return;
    this.br[row - 1] += re;
    this.bi[row - 1] += im;
  }
}

/** Records one element's stamps so its terminal currents can be read from a solution. */
export class RecordingStamper extends ComplexStamperBase {
  readonly entries: { row: number; col: number; re: number; im: number }[] = [];
  readonly rhsEntries: { row: number; re: number; im: number }[] = [];

  matrix(row: UnknownIndex, col: UnknownIndex, re: number, im: number): void {
    if (row > 0 && col > 0) this.entries.push({ row, col, re, im });
  }

  rhs(row: UnknownIndex, re: number, im: number): void {
    if (row > 0) this.rhsEntries.push({ row, re, im });
  }

  /** Element current leaving node `row` into the element: (A·x - b)[row]. */
  residual(row: number, xr: Float64Array, xi: Float64Array): [number, number] {
    let re = 0;
    let im = 0;
    for (const e of this.entries) {
      if (e.row !== row) continue;
      re += e.re * xr[e.col] - e.im * xi[e.col];
      im += e.re * xi[e.col] + e.im * xr[e.col];
    }
    for (const e of this.rhsEntries) {
      if (e.row !== row) continue;
      re -= e.re;
      im -= e.im;
    }
    return [re, im];
  }
}

/** A real Stamper writing into the real part of a complex one; rhs writes are dropped (small signal). */
export function realMatrixOnly(s: ComplexStamper): Stamper {
  return {
    matrix: (r, c, v) => s.matrix(r, c, v, 0),
    rhs: () => {},
    conductance: (a, b, g) => s.admittance(a, b, g, 0),
    current: () => {},
    voltageSource: (br, p, m) => s.voltageSource(br, p, m, 0, 0),
  };
}
