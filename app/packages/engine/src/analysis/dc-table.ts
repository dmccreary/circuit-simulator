// DC operating point tables (ANL-03): node voltages, per-part voltage,
// current, power and readouts, and the power balance.

import type { Netlist } from "@cs/model";
import { fillDisplay, VectorView, type FactoryLookup } from "../circuit";
import { GMIN, operatingPoint } from "./dc-op";
import type { DcPartRow, DcResult } from "./types";

export function dcTable(netlist: Netlist, lookup: FactoryLookup): DcResult {
  const op = operatingPoint(netlist, lookup);
  const c = op.circuit;
  const empty: DcResult = { kind: "dc", ok: false, error: op.error, nodes: [], parts: [], powerDelivered: 0, powerAbsorbed: 0, display: [] };
  if (!op.x) return empty;
  const display = new Float64Array(c.displaySize);
  fillDisplay(c, op.x, display);
  const view = new VectorView(op.x);
  const nodes = [];
  for (let n = 1; n <= c.nodeCount; n++) nodes.push({ index: n, name: netlist.nodeNames[n] ?? `N${n}`, voltage: op.x[n] });
  const parts: DcPartRow[] = [];
  let delivered = 0;
  let absorbed = 0;
  const base = c.nodeCount + 1;
  netlist.elements.forEach((el, i) => {
    const m = c.models[i];
    if (!m) return;
    const readouts: Record<string, number> = {};
    m.readouts(view, { add: (k, v) => void (readouts[k] = v) });
    let power = 0;
    const off = base + c.termOffsets[i];
    for (let k = 0; k < el.nodes.length; k++) power += display[el.nodes[k]] * display[off + k];
    const voltage = el.nodes.length >= 2 ? display[el.nodes[0]] - display[el.nodes[1]] : (readouts.voltage ?? 0);
    const current = el.nodes.length > 0 ? display[off] : 0;
    if (power < 0) delivered -= power;
    else absorbed += power;
    parts.push({ id: el.id, type: el.type, voltage, current, power, readouts });
  });
  // The operating point's node shunts (dc-op.ts) absorb gmin·V² each: the solver leakage.
  let leakage = 0;
  for (let n = 1; n <= c.nodeCount; n++) leakage += GMIN * op.x[n] * op.x[n];
  for (const n of c.idleNodes) leakage += 1e-12 * op.x[n] * op.x[n]; // the idle-node hold, also in dc-op.ts
  absorbed += leakage;
  return {
    kind: "dc",
    ok: true,
    nodes,
    parts,
    powerDelivered: delivered,
    powerAbsorbed: absorbed,
    powerLeakage: leakage,
    display: Array.from(display),
  };
}
