import type { NetlistElement } from "@cs/model";
import type { ModelFactory, ReadoutSink, SolutionView, Stamper } from "../api";
import { init, TwoTerminalModel } from "../shared/modelKit";
import { num, R_MIN, R_OPEN, type Props } from "../shared/props";
import { isClosed } from "../shared/switchState";

/**
 * Contacts as a tiny or huge resistance. When the compiler has already merged
 * the terminals (ideal closed switch) both nodes are equal and the stamp cancels.
 */
export class SwitchModel extends TwoTerminalModel {
  private closed = false;
  private g = 1 / R_OPEN;

  constructor(
    el: NetlistElement,
    private readonly kind: "switch" | "push-button",
  ) {
    super(el);
  }

  protected applyProps(p: Props): void {
    this.closed = isClosed(this.kind, p);
    this.g = this.closed ? 1 / Math.max(R_MIN, num(p, "onResistance", 0)) : 1 / R_OPEN;
  }

  stampStatic(s: Stamper): void {
    s.conductance(this.a, this.b, this.g);
  }

  protected current(x: SolutionView): number {
    return this.voltage(x) * this.g;
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    out.add("closed", this.closed ? 1 : 0);
    out.add("voltage", this.voltage(x));
    out.add("current", this.current(x));
  }
}

export const switchModel: ModelFactory = (el) => init(new SwitchModel(el, "switch"), el);
