// Expression-controlled sources after CircuitJS1's VCVSElm, VCCSElm, CCVSElm,
// and CCCSElm doStep(): each Newton iteration evaluates the formula at the
// present inputs and stamps its numeric partial derivatives.
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/VCCSElm.java
// Voltage outputs:  V(+) - V(-) = f;  current outputs: f flows out of "+" into
// the circuit and back into "-". Current inputs are sensed by 0 V sources from
// each pair's "+" pin to its "-" pin. Unused pins leak 1 nS to ground.

import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, Stamper, StepInfo, UnknownIndex } from "../api";
import { init } from "../shared/modelKit";
import { num, str, type Props } from "../shared/props";
import { EXPR_KINDS, EXPR_MAX_INPUTS, OUT_MINUS, OUT_PLUS, type ExprKind } from "./descriptor";
import { compileExpr, newExprState, type CompiledExpr } from "./expr";

const G_UNUSED = 1e-9;
const DX_MIN = 1e-6;

class ExpressionSourceModel implements ElementModel {
  readonly nonlinear = true;
  readonly stateSize = 10;
  private n: NodeIndex[];
  private kind: ExprKind = "vcvs";
  private inputs = 2;
  private f: CompiledExpr = () => 0;
  private st = newExprState();
  private out: UnknownIndex = 0;
  private sense: UnknownIndex[] = [];
  /** Input values at the previous Newton iteration (convergence test, derivative step). */
  private iter = new Float64Array(9);

  constructor(el: NetlistElement) {
    this.n = el.nodes.slice();
  }

  private get currentControlled(): boolean {
    return this.kind === "ccvs" || this.kind === "cccs";
  }

  private get voltageOutput(): boolean {
    return this.kind === "vcvs" || this.kind === "ccvs";
  }

  /** Number of formula variables (inputs, or input pairs). */
  private get vars(): number {
    return this.currentControlled ? Math.floor(this.inputs / 2) : this.inputs;
  }

  setProps(p: Props): void {
    const k = str(p, "kind", "vcvs");
    this.kind = (EXPR_KINDS as readonly string[]).includes(k) ? (k as ExprKind) : "vcvs";
    this.inputs = Math.max(0, Math.min(EXPR_MAX_INPUTS, Math.round(num(p, "inputs", 2))));
    try {
      this.f = compileExpr(str(p, "expression", "0"));
    } catch {
      this.f = () => 0;
    }
  }

  setup(ctx: SetupContext): void {
    this.n = ctx.nodes.slice();
    this.out = this.voltageOutput ? ctx.allocBranch("out") : 0;
    this.sense = [];
    for (let k = 0; k < this.vars && this.currentControlled; k++) this.sense.push(ctx.allocBranch(`sense${k}`));
  }

  initialize(): void {
    this.st = newExprState();
    this.iter.fill(0);
  }

  /** Present value of each formula variable. */
  private read(x: SolutionView, into: Float64Array): void {
    for (let k = 0; k < this.vars; k++) into[k] = this.currentControlled ? x.x(this.sense[k]) : x.v(this.n[k]);
    // CCVSElm also exposes the first current as "i".
    if (this.currentControlled && this.vars > 0 && this.vars < 9) into[8] = into[0];
  }

  private eval(values: Float64Array): number {
    this.st.values.set(values.subarray(0, 9));
    if (!this.currentControlled && this.vars <= 4) this.st.values[4] = values[4] || Math.E;
    const v = this.f(this.st);
    return Number.isFinite(v) ? v : 0;
  }

  stampStatic(s: Stamper): void {
    const used = this.currentControlled ? 2 * this.vars : this.vars;
    for (let k = used; k < EXPR_MAX_INPUTS; k++) s.conductance(this.n[k], 0, G_UNUSED);
    this.sense.forEach((br, k) => s.voltageSource(br, this.n[2 * k], this.n[2 * k + 1], 0));
  }

  stampNewton(s: Stamper, x: SolutionView, step: StepInfo): void {
    this.st.t = step.t;
    this.st.timestep = step.kind === "transient" ? step.dt : 0;
    const vals = new Float64Array(9);
    vals[4] = Math.E;
    this.read(x, vals);
    const f0 = this.eval(vals);
    let rhs = f0;
    const p = this.n[OUT_PLUS];
    const m = this.n[OUT_MINUS];
    const gains: number[] = [];
    for (let k = 0; k < this.vars; k++) {
      let dv = vals[k] - this.iter[k];
      if (Math.abs(dv) < DX_MIN) dv = DX_MIN;
      if (this.currentControlled) dv = 1e-9;
      const save = vals[k];
      vals[k] = save - dv;
      if (this.currentControlled && k === 0) vals[8] = vals[0];
      const f1 = this.eval(vals);
      vals[k] = save;
      if (this.currentControlled && k === 0) vals[8] = save;
      let g = (f0 - f1) / dv;
      if (Math.abs(g) < 1e-6) g = g < 0 ? -1e-6 : 1e-6;
      gains.push(g);
      rhs -= g * save;
    }
    this.iter.set(vals);
    const ac = step.kind === "ac";
    const col = (k: number) => (this.currentControlled ? this.sense[k] : this.n[k]);
    if (this.voltageOutput) {
      s.voltageSource(this.out, p, m, ac ? 0 : rhs);
      gains.forEach((g, k) => s.matrix(this.out, col(k), -g));
    } else {
      if (!ac) s.current(m, p, rhs);
      gains.forEach((g, k) => {
        s.matrix(m, col(k), g);
        s.matrix(p, col(k), -g);
      });
    }
  }

  hasConverged(x: SolutionView): boolean {
    const vals = new Float64Array(9);
    this.read(x, vals);
    for (let k = 0; k < this.vars; k++) {
      const tol = this.currentControlled ? 1e-9 + 1e-3 * Math.abs(vals[k]) : 1e-6 + 1e-3 * Math.abs(vals[k]);
      if (Math.abs(vals[k] - this.iter[k]) > tol) return false;
    }
    return true;
  }

  private output(x: SolutionView): number {
    if (this.voltageOutput) return x.v(this.n[OUT_PLUS]) - x.v(this.n[OUT_MINUS]);
    const vals = new Float64Array(9);
    vals[4] = Math.E;
    this.read(x, vals);
    return this.eval(vals);
  }

  accept(x: SolutionView, step: StepInfo): void {
    if (step.kind !== "transient" && step.kind !== "dc") return;
    const vals = new Float64Array(9);
    vals[4] = Math.E;
    this.read(x, vals);
    this.st.lastOutput = this.output(x);
    this.st.lastValues.set(vals);
    this.iter.set(vals);
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    out.add("output", this.output(x));
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    out.fill(0);
    this.sense.forEach((br, k) => {
      const i = x.x(br);
      out[2 * k] = i;
      out[2 * k + 1] = -i;
    });
    if (this.voltageOutput) {
      const i = x.x(this.out);
      out[OUT_PLUS] = i;
      out[OUT_MINUS] = -i;
    } else {
      const i = this.output(x);
      out[OUT_PLUS] = -i;
      out[OUT_MINUS] = i;
    }
  }

  saveState(o: Float64Array): void {
    o.set(this.st.lastValues, 0);
    o[9] = this.st.lastOutput;
  }

  loadState(f: Float64Array): void {
    this.st.lastValues.set(f.subarray(0, 9));
    this.st.lastOutput = f[9];
  }
}

export const expressionSourceModel: ModelFactory = (el) => init(new ExpressionSourceModel(el), el);
