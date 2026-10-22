import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, StepInfo, Stamper, UnknownIndex } from "../api";
import { init } from "../shared/modelKit";
import { num, type Props } from "../shared/props";

type Kind = "vcvs" | "vccs" | "ccvs" | "cccs";

/**
 * Linear dependent sources (SPICE E, G, H, F). Terminals C+, C-, O+, O-.
 * Current-controlled kinds sense through a zero-volt source between C+ and C-
 * (branch `ctl`, current into C+). Voltage outputs use branch `out`, current
 * into O+. Current outputs push gain·control into O+ and out of O-.
 */
class ControlledSourceModel implements ElementModel {
  readonly stateSize = 0;
  private n: NodeIndex[];
  private gain = 1;
  private ctl: UnknownIndex = 0;
  private out: UnknownIndex = 0;

  constructor(
    el: NetlistElement,
    private readonly kind: Kind,
  ) {
    this.n = [0, 1, 2, 3].map((i) => el.nodes[i] ?? 0);
  }

  private get currentControlled(): boolean {
    return this.kind === "ccvs" || this.kind === "cccs";
  }

  private get voltageOutput(): boolean {
    return this.kind === "vcvs" || this.kind === "ccvs";
  }

  setup(ctx: SetupContext): void {
    this.n = [0, 1, 2, 3].map((i) => ctx.nodes[i] ?? 0);
    if (this.currentControlled) this.ctl = ctx.allocBranch("control");
    if (this.voltageOutput) this.out = ctx.allocBranch("out");
  }

  setProps(p: Props): void {
    this.gain = num(p, "gain", 1);
  }

  stampStatic(s: Stamper): void {
    const [cp, cm, op, om] = this.n;
    const k = this.gain;
    if (this.currentControlled) s.voltageSource(this.ctl, cp, cm, 0);
    switch (this.kind) {
      case "vcvs": // V(op) - V(om) - k·(V(cp) - V(cm)) = 0
        s.voltageSource(this.out, op, om, 0);
        s.matrix(this.out, cp, -k);
        s.matrix(this.out, cm, k);
        break;
      case "ccvs": // V(op) - V(om) - k·i(ctl) = 0
        s.voltageSource(this.out, op, om, 0);
        s.matrix(this.out, this.ctl, -k);
        break;
      case "vccs": // current k·(V(cp) - V(cm)) into op, out of om
        s.matrix(op, cp, k);
        s.matrix(op, cm, -k);
        s.matrix(om, cp, -k);
        s.matrix(om, cm, k);
        break;
      case "cccs":
        s.matrix(op, this.ctl, k);
        s.matrix(om, this.ctl, -k);
        break;
    }
  }

  accept(_x: SolutionView, _step: StepInfo): void {}

  /** Controlling voltage or current. */
  private control(x: SolutionView): number {
    return this.currentControlled ? x.x(this.ctl) : x.v(this.n[0]) - x.v(this.n[1]);
  }

  /** Current into O+ through the source. */
  private outputCurrent(x: SolutionView): number {
    return this.voltageOutput ? x.x(this.out) : this.gain * this.control(x);
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    const ic = this.currentControlled ? x.x(this.ctl) : 0;
    const io = this.outputCurrent(x);
    out[0] = ic;
    out[1] = -ic;
    out[2] = io;
    out[3] = -io;
  }

  readouts(x: SolutionView, out: ReadoutSink): void {
    const v = x.v(this.n[2]) - x.v(this.n[3]);
    const delivered = -this.outputCurrent(x);
    out.add("voltage", v);
    out.add("current", delivered);
    out.add("power", v * delivered);
    out.add("control", this.control(x));
  }

  saveState(_out: Float64Array): void {}
  loadState(_from: Float64Array): void {}
}

const factory =
  (kind: Kind): ModelFactory =>
  (el) =>
    init(new ControlledSourceModel(el, kind), el);

export const vcvsModel = factory("vcvs");
export const vccsModel = factory("vccs");
export const ccvsModel = factory("ccvs");
export const cccsModel = factory("cccs");
