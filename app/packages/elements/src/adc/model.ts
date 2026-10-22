import type { NetlistElement, NodeIndex } from "@cs/model";
import type { ElementModel, ModelFactory, ReadoutSink, SetupContext, SolutionView, Stamper, StepInfo } from "../api";
import { init } from "../shared/modelKit";
import { num, type Props } from "../shared/props";
import { CONVERTER_BITS } from "../dac/descriptor";
import { adcType } from "./descriptor";

/**
 * CircuitJS1 ADCElm.execute(): code = floor((2^bits − 1) · V(In) / V(V+)),
 * clamped, on outputs D (bit i on terminal i). Like CircuitJS1 it samples
 * the previous accepted solution, so the outputs lag the input by one step.
 * Each output is a source of `supply` or 0 V behind `outputResistance`.
 */
class AdcModel implements ElementModel {
  readonly stateSize = 1;
  private nodes: NodeIndex[];
  private code = 0;
  private vHigh = 5;
  private g = 1 / 25;

  constructor(el: NetlistElement, private readonly bits: number) {
    this.nodes = el.nodes.slice();
  }

  setup(ctx: SetupContext): void {
    this.nodes = ctx.nodes.slice();
  }

  setProps(p: Props): void {
    this.vHigh = num(p, "supply", 5);
    this.g = 1 / Math.max(1e-6, num(p, "outputResistance", 25));
  }

  initialize(): void {
    this.code = 0;
  }

  stampStep(s: Stamper, _step: StepInfo): void {
    for (let i = 0; i < this.bits; i++) {
      const n = this.nodes[i];
      s.conductance(n, 0, this.g);
      if ((this.code >> i) & 1) s.current(0, n, this.vHigh * this.g);
    }
  }

  accept(x: SolutionView, _step: StepInfo): void {
    const max = (1 << this.bits) - 1;
    const vin = x.v(this.nodes[this.bits]);
    const vref = x.v(this.nodes[this.bits + 1]);
    const val = vref !== 0 ? Math.floor((max * vin) / vref) : vin > 0 ? max : 0;
    this.code = Number.isFinite(val) ? Math.min(max, Math.max(0, val)) : 0;
  }

  readouts(_x: SolutionView, out: ReadoutSink): void {
    out.add("code", this.code);
  }

  terminalCurrents(x: SolutionView, out: Float64Array): void {
    out.fill(0);
    for (let i = 0; i < this.bits; i++) {
      const target = (this.code >> i) & 1 ? this.vHigh : 0;
      out[i] = (x.v(this.nodes[i]) - target) * this.g;
    }
  }

  saveState(out: Float64Array): void {
    out[0] = this.code;
  }

  loadState(from: Float64Array): void {
    this.code = from[0] ?? 0;
  }
}

export const ADC_MODELS: Record<string, ModelFactory> = Object.fromEntries(
  CONVERTER_BITS.map((b) => [adcType(b), (el: NetlistElement) => init(new AdcModel(el, b), el)]),
);
