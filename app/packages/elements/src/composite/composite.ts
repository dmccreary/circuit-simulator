// A model built from other models, like CircuitJS1's CompositeElm
// (https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/CompositeElm.java):
// each child is an ordinary ElementModel wired to the part's terminals and to
// internal nodes. Internal nodes are extra unknowns from allocBranch(); their
// matrix rows are plain KCL rows, so children stamp them like any node. A
// small shunt to ground keeps an internal node that only touches junctions
// from floating (the engine's own gmin shunt covers terminal nodes only).

import type { NetlistElement, NodeIndex, PropValue } from "@cs/model";
import type {
  ComplexStamper,
  ElementModel,
  ModelFactory,
  ReadoutSink,
  SetupContext,
  SolutionView,
  StepInfo,
  Stamper,
  UnknownIndex,
} from "../api";

/** Local node numbering: 0 ground, 1..terminalCount the part's terminals in order, then internal nodes. */
export interface ChildSpec {
  factory: ModelFactory;
  type: string;
  nodes: number[];
  props: Record<string, PropValue>;
}

/** Conductance from each internal node to ground, siemens. */
const INTERNAL_SHUNT = 1e-12;

export class CompositeModel implements ElementModel {
  readonly stateSize: number;
  readonly nonlinear: boolean;
  private readonly children: ElementModel[];
  private readonly local: NodeIndex[];
  private readonly sizes: number[];
  private readonly scratch: Float64Array[];
  private readonly specs: ChildSpec[];
  private internals: UnknownIndex[] = [];

  /**
   * @param terminals number of terminals of the part
   * @param internal number of internal nodes (local numbers terminals+1 ..)
   * @param build child specs from the part's props; the structure must not depend on the props
   */
  constructor(
    el: NetlistElement,
    private readonly terminals: number,
    private readonly internal: number,
    private readonly build: (props: Record<string, PropValue>) => ChildSpec[],
  ) {
    this.local = new Array<NodeIndex>(1 + terminals + internal).fill(0);
    for (let k = 0; k < terminals; k++) this.local[k + 1] = el.nodes[k] ?? 0;
    this.specs = build(el.props);
    this.children = this.specs.map((c, i) => c.factory({ id: `${el.id}/${i}`, type: c.type, nodes: c.nodes.map((n) => this.local[n] ?? 0), props: c.props }));
    this.sizes = this.children.map((m) => m.stateSize);
    this.stateSize = this.sizes.reduce((a, b) => a + b, 0);
    this.nonlinear = this.children.some((m) => m.nonlinear === true);
    this.scratch = this.specs.map((c) => new Float64Array(c.nodes.length));
  }

  setup(ctx: SetupContext): void {
    for (let k = 0; k < this.terminals; k++) this.local[k + 1] = ctx.nodes[k] ?? 0;
    this.internals = [];
    for (let k = 0; k < this.internal; k++) {
      const u = ctx.allocBranch(`node${k + 1}`);
      this.local[this.terminals + 1 + k] = u;
      this.internals.push(u);
    }
    this.children.forEach((m, i) => {
      m.setup({ nodes: this.specs[i].nodes.map((n) => this.local[n] ?? 0), allocBranch: (name) => ctx.allocBranch(`${i}.${name}`) });
    });
  }

  setProps(props: Record<string, PropValue>): void {
    const specs = this.build(props);
    this.children.forEach((m, i) => m.setProps(specs[i]?.props ?? {}));
  }

  initialize(): void {
    for (const m of this.children) m.initialize?.();
  }

  stampStatic(s: Stamper): void {
    for (const m of this.children) m.stampStatic?.(s);
  }

  /** The shunt follows the engine's gmin, so gmin stepping reaches internal nodes too. */
  stampStep(s: Stamper, step: StepInfo): void {
    const g = Math.max(INTERNAL_SHUNT, step.gmin);
    for (const u of this.internals) s.conductance(u, 0, g);
    for (const m of this.children) m.stampStep?.(s, step);
  }

  stampNewton(s: Stamper, x: SolutionView, step: StepInfo): void {
    for (const m of this.children) if (m.nonlinear) m.stampNewton?.(s, x, step);
  }

  hasConverged(x: SolutionView, previous: SolutionView): boolean {
    return this.children.every((m) => !m.nonlinear || !m.hasConverged || m.hasConverged(x, previous));
  }

  stampAC(s: ComplexStamper, op: SolutionView, omega: number): void {
    for (const u of this.internals) s.admittance(u, 0, INTERNAL_SHUNT, 0);
    for (const m of this.children) m.stampAC?.(s, op, omega);
  }

  accept(x: SolutionView, step: StepInfo): void {
    for (const m of this.children) m.accept(x, step);
  }

  breakpoints(t0: number, t1: number, out: number[]): void {
    for (const m of this.children) m.breakpoints?.(t0, t1, out);
  }

  /** Sum of the children's currents into each of the part's terminals. */
  terminalCurrents(x: SolutionView, out: Float64Array): void {
    out.fill(0);
    this.children.forEach((m, i) => {
      const buf = this.scratch[i];
      buf.fill(0);
      m.terminalCurrents(x, buf);
      this.specs[i].nodes.forEach((n, k) => {
        if (n >= 1 && n <= this.terminals) out[n - 1] += buf[k];
      });
    });
  }

  /** Voltage at each terminal; parts add their own readouts on top. */
  readouts(x: SolutionView, out: ReadoutSink): void {
    for (let k = 0; k < this.terminals; k++) out.add(`v${k}`, x.v(this.local[k + 1]));
  }

  /** Readouts of one child (for parts that report a child's values). */
  childReadouts(i: number, x: SolutionView, out: ReadoutSink): void {
    this.children[i]?.readouts(x, out);
  }

  /** Solution value of a local node (0 ground, 1.. terminals, then internal nodes). */
  nodeVoltage(x: SolutionView, local: number): number {
    return x.v(this.local[local] ?? 0);
  }

  saveState(out: Float64Array): void {
    let k = 0;
    this.children.forEach((m, i) => {
      const n = this.sizes[i];
      if (n > 0) m.saveState(out.subarray(k, k + n));
      k += n;
    });
  }

  loadState(from: Float64Array): void {
    let k = 0;
    this.children.forEach((m, i) => {
      const n = this.sizes[i];
      if (n > 0) m.loadState(from.subarray(k, k + n));
      k += n;
    });
  }
}
