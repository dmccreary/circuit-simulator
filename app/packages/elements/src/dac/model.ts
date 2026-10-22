import type { NetlistElement } from "@cs/model";
import type { DigitalContext, ModelFactory, ReadoutSink, SetupContext, SolutionView, Stamper, StepInfo, UnknownIndex } from "../api";
import { LogicModel } from "../logic/model";
import { init } from "../shared/modelKit";
import { CONVERTER_BITS, dacType } from "./descriptor";

/**
 * CircuitJS1 DACElm.doStep(): an ideal source from O to ground at
 * V(O) = code / (2^bits − 1) · V(V+), the code read from the digital inputs.
 */
class DacModel extends LogicModel {
  private br: UnknownIndex = 0;
  private k = 0;

  constructor(el: NetlistElement, private readonly bits: number) {
    super(el);
  }

  override setup(ctx: SetupContext): void {
    super.setup(ctx);
    this.br = ctx.allocBranch("dac");
  }

  evaluateDigital(ctx: DigitalContext): void {
    let code = 0;
    for (let i = 0; i < this.bits; i++) if (this.read(ctx, i) === "1") code |= 1 << i;
    this.k = code / ((1 << this.bits) - 1);
  }

  stampStep(s: Stamper, _step: StepInfo): void {
    const o = this.nodes[this.bits];
    const vp = this.nodes[this.bits + 1];
    s.matrix(o, this.br, 1);
    s.matrix(this.br, o, 1);
    s.matrix(this.br, vp, -this.k);
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    out.add("voltage", x.v(this.nodes[this.bits]));
  }

  override terminalCurrents(x: SolutionView, out: Float64Array): void {
    out.fill(0);
    out[this.bits] = x.x(this.br);
  }
}

export const DAC_MODELS: Record<string, ModelFactory> = Object.fromEntries(
  CONVERTER_BITS.map((b) => [dacType(b), (el: NetlistElement) => init(new DacModel(el, b), el)]),
);
