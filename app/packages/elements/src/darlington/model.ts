// After CircuitJS1's DarlingtonElm, a CompositeElm of two transistors:
//   "NTransistorElm 1 2 4\rNTransistorElm 4 2 3", external nodes {1, 2, 3} = B, C, E
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/DarlingtonElm.java

import type { NetlistElement } from "@cs/model";
import type { ModelFactory, ReadoutSink, SolutionView } from "../api";
import { npnModel, pnpModel } from "../bjt/model";
import { CompositeModel } from "../composite/composite";
import { init } from "../shared/modelKit";
import { num } from "../shared/props";

class DarlingtonModel extends CompositeModel {
  constructor(el: NetlistElement, pnp: boolean) {
    const factory = pnp ? pnpModel : npnModel;
    const type = pnp ? "pnp-transistor" : "npn-transistor";
    super(el, 3, 1, (p) => {
      const props = { beta: num(p, "beta", 100) };
      return [
        { factory, type, nodes: [1, 2, 4], props },
        { factory, type, nodes: [4, 2, 3], props },
      ];
    });
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    const cur = new Float64Array(3);
    this.terminalCurrents(x, cur);
    const [vb, vc, ve] = [1, 2, 3].map((k) => this.nodeVoltage(x, k));
    out.add("ib", cur[0]);
    out.add("ic", cur[1]);
    out.add("vbe", vb - ve);
    out.add("vce", vc - ve);
  }
}

export const npnDarlingtonModel: ModelFactory = (el) => init(new DarlingtonModel(el, false), el);
export const pnpDarlingtonModel: ModelFactory = (el) => init(new DarlingtonModel(el, true), el);
