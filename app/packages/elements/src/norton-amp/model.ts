// After CircuitJS1's NortonAmpElm, a CompositeElm (model "nortonamp"):
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/NortonAmpElm.java
//   <d nn="1 0"/> <d nn="2 0"/> <CCCS nn="3 2 1 0" ex="-a"/> <a nn="1 0 4" ma="12" mi="0" ga="100000"/>
//   external nodes in+ = 3, in- = 1, out = 4; node 2 is internal.
// The CCCS senses the "+" input current (into the diode at node 2) and draws
// the same current out of the "-" input; ./mirror.ts folds that diode and the
// CCCS into one model, so the composite needs no internal node.

import type { NetlistElement } from "@cs/model";
import type { ModelFactory, ReadoutSink, SolutionView } from "../api";
import { CompositeModel, type ChildSpec } from "../composite/composite";
import { diodeModel } from "../diode/model";
import { limitedAmpModel } from "./amp";
import { mirroredDiodeModel } from "./mirror";
import { init } from "../shared/modelKit";
import { num } from "../shared/props";

// Local nodes: 1 in+, 2 in-, 3 out.
class NortonAmpModel extends CompositeModel {
  constructor(el: NetlistElement) {
    super(el, 3, 0, (p): ChildSpec[] => [
      { factory: diodeModel, type: "diode", nodes: [2, 0], props: {} },
      { factory: mirroredDiodeModel, type: "diode", nodes: [1, 0, 2, 0], props: {} },
      { factory: limitedAmpModel, type: "op-amp", nodes: [2, 0, 3], props: { gain: num(p, "gain", 1e5), maxOutput: num(p, "maxOutput", 12) } },
    ]);
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    const cur = new Float64Array(3);
    this.terminalCurrents(x, cur);
    out.add("vPlus", this.nodeVoltage(x, 1));
    out.add("vMinus", this.nodeVoltage(x, 2));
    out.add("vOut", this.nodeVoltage(x, 3));
    out.add("outputCurrent", -cur[2]);
  }
}

export const nortonAmpModel: ModelFactory = (el) => init(new NortonAmpModel(el), el);
