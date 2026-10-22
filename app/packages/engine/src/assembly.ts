// MNA assembly: a dense matrix A and right-hand side b that element models
// stamp into through the Stamper contract. Unknown u (1-based; 0 = ground)
// lives at matrix row/column u - 1.

import type { NodeIndex } from "@cs/model";
import type { Stamper, UnknownIndex } from "@cs/elements";

export class MnaSystem implements Stamper {
  readonly A: Float64Array;
  readonly b: Float64Array;
  private readonly staticA: Float64Array;
  private readonly staticB: Float64Array;

  constructor(readonly size: number) {
    this.A = new Float64Array(size * size);
    this.b = new Float64Array(size);
    this.staticA = new Float64Array(size * size);
    this.staticB = new Float64Array(size);
  }

  matrix(row: UnknownIndex, col: UnknownIndex, value: number): void {
    if (row === 0 || col === 0) return;
    this.A[(row - 1) * this.size + (col - 1)] += value;
  }

  rhs(row: UnknownIndex, value: number): void {
    if (row === 0) return;
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

  /** Clear A and b; the following stamps become the static part. */
  beginStatic(): void {
    this.A.fill(0);
    this.b.fill(0);
  }

  endStatic(): void {
    this.staticA.set(this.A);
    this.staticB.set(this.b);
  }

  /** Reset A and b to the static part, ready for per-step stamps. */
  begin(): void {
    this.A.set(this.staticA);
    this.b.set(this.staticB);
  }

  /** Add g from every node (unknowns 1..nodeCount) to ground. */
  addNodeShunt(nodeCount: number, g: number): void {
    if (g === 0) return;
    for (let u = 1; u <= nodeCount; u++) this.A[(u - 1) * this.size + (u - 1)] += g;
  }
}
