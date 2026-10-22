// Generated benchmark circuits: an RC ladder whose every rung also carries a
// diode clamp and an NPN emitter follower, so the matrix mixes linear,
// non-linear and branch (voltage source) unknowns the way real circuits do.

import type { Netlist, NetlistElement, PropValue } from "@cs/model";

/** Parts per ladder stage (R, C, D, Rd, Q, Re). */
export const PARTS_PER_STAGE = 6;

/**
 * A ladder with about `parts` parts: an AC source and a 9 V supply drive
 * `stages` rungs. Node 1 is the source, node 2 is Vcc.
 */
export function ladderNetlist(parts: number): Netlist {
  const stages = Math.max(1, Math.round((parts - 2) / PARTS_PER_STAGE));
  const elements: NetlistElement[] = [];
  const add = (id: string, type: string, nodes: number[], props: Record<string, PropValue> = {}) =>
    elements.push({ id, type, nodes, props });
  let nodeCount = 2;
  const node = () => ++nodeCount;
  add("V1", "ac-source", [1, 0], { amplitude: 2.5, frequency: 1000, offset: 2.5, phase: 0 });
  add("VCC", "battery", [2, 0], { voltage: 9 });
  let prev = 1;
  for (let k = 1; k <= stages; k++) {
    const a = node();
    const d = node();
    const e = node();
    add(`R${k}`, "resistor", [prev, a], { resistance: 1000 });
    add(`C${k}`, "capacitor", [a, 0], { capacitance: 100e-9 });
    add(`D${k}`, "diode", [a, d]);
    add(`RD${k}`, "resistor", [d, 0], { resistance: 10000 });
    add(`Q${k}`, "npn-transistor", [a, 2, e]);
    add(`RE${k}`, "resistor", [e, 0], { resistance: 4700 });
    prev = a;
  }
  const nodeNames = ["GND", ...Array.from({ length: nodeCount }, (_, i) => `N${i + 1}`)];
  return {
    nodeCount,
    nodeNames,
    elements,
    settings: { realisticParts: false, realisticRatings: false, start: "zero", seed: 1 },
  };
}
