// After CircuitJS1's OTAElm, a CompositeElm of 16 transistors and two supply
// rails (the LM13700 schematic). Model string and external nodes copied from
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/OTAElm.java
//   external nodes {7, 5, 15, 1, 13} = +, -, D (diode bias), Iabc, out

import type { NetlistElement } from "@cs/model";
import type { ModelFactory, ReadoutSink, SolutionView } from "../api";
import { npnModel, pnpModel } from "../bjt/model";
import { dcSourceModel } from "../dc-source/model";
import { CompositeModel, type ChildSpec } from "../composite/composite";
import { init } from "../shared/modelKit";
import { num } from "../shared/props";

const MODEL = [
  "RailElm 4", "RailElm 10",
  "N 1 2 3", "N 3 1 4", "N 3 3 4", "N 5 6 2", "N 7 8 2",
  "P 9 6 10", "P 9 9 10", "P 6 12 9", "P 11 8 10", "P 11 11 10", "P 8 13 11",
  "N 14 14 4", "N 14 12 4", "N 12 13 14", "N 15 15 5", "N 15 15 7",
];
const EXTERNAL = [7, 5, 15, 1, 13];
const INTERNAL = [2, 3, 4, 6, 8, 9, 10, 11, 12, 14];

/** CircuitJS1 node number -> composite local node (1.. terminals, then internal). */
const LOCAL = new Map<number, number>([...EXTERNAL.map((n, i) => [n, i + 1] as const), ...INTERNAL.map((n, i) => [n, EXTERNAL.length + 1 + i] as const)]);
const loc = (n: number) => LOCAL.get(n) ?? 0;

class OtaModel extends CompositeModel {
  constructor(el: NetlistElement) {
    super(el, EXTERNAL.length, INTERNAL.length, (p) => {
      const rails = [num(p, "negSupply", -9), num(p, "posSupply", 9)];
      let r = 0;
      return MODEL.map((line): ChildSpec => {
        const [kind, ...nodes] = line.split(" ");
        const n = nodes.map(Number);
        if (kind === "RailElm") return { factory: dcSourceModel, type: "dc-source", nodes: [loc(n[0]), 0], props: { voltage: rails[r++] } };
        const pnp = kind === "P";
        return { factory: pnp ? pnpModel : npnModel, type: pnp ? "pnp-transistor" : "npn-transistor", nodes: n.map(loc), props: { beta: 100 } };
      });
    });
  }

  override readouts(x: SolutionView, out: ReadoutSink): void {
    const cur = new Float64Array(5);
    this.terminalCurrents(x, cur);
    out.add("iabc", cur[3]);
    out.add("vDiff", this.nodeVoltage(x, 1) - this.nodeVoltage(x, 2));
    out.add("outputCurrent", -cur[4]);
  }
}

export const otaModel: ModelFactory = (el) => init(new OtaModel(el), el);
