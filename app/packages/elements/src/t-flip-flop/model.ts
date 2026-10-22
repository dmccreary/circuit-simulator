import type { NetlistElement } from "@cs/model";
import type { ModelFactory, ReadoutSink } from "../api";
import { ChipModel, chipFactory } from "../chip-kit/model";
import { TFF_FORMS, tffType, type TffPins } from "./descriptor";

/** CircuitJS1 TFlipFlopElm.execute(): Q toggles on a rising clock while T is high; S and R are active high. */
class TffModel extends ChipModel {
  constructor(el: NetlistElement, private readonly form: TffPins) {
    super(el);
  }

  protected override reset(): void {
    this.v[2] = true;
  }

  protected execute(): void {
    if (this.v[3] && !this.lastClock && this.v[0]) this.v[1] = !this.v[1];
    if (this.form === "set-reset" && this.v[5]) this.v[1] = true;
    if (this.form !== "plain" && this.v[4]) this.v[1] = false;
    this.v[2] = !this.v[1];
    this.lastClock = this.v[3];
  }

  protected override extraReadouts(out: ReadoutSink): void {
    out.add("q", this.v[1] ? 1 : 0);
  }
}

export const TFF_MODELS: Record<string, ModelFactory> = Object.fromEntries(TFF_FORMS.map((f) => [tffType(f), chipFactory(TffModel, f)]));
