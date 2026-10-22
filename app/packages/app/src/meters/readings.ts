// What a hover card or pinned meter shows (CAN-16, CAN-17): a part's voltage
// across, current through, power, and the quantities special to it that
// follow from those and its values; a node's name and voltage; a wire
// segment's current and direction.

import type { CompiledCircuit, Part } from "@cs/model";
import type { Unit } from "@cs/units";
import { elementPower, indexOf, nodeVoltage, segmentCurrent, segmentOf, terminalCurrent, type LiveSource } from "../probes/evaluate";

export interface Reading {
  key: string;
  value: number;
  unit: Unit;
  /** Shown after the unit: "/s", "C", "Wb" for units the unit table lacks. */
  suffix?: string;
}

const num = (p: Part, k: string): number | undefined => (typeof p.props[k] === "number" ? (p.props[k] as number) : undefined);

/** Voltage across (terminal 0 − terminal 1), current into terminal 0, power absorbed. */
export function partVIP(src: LiveSource, partId: string): { v?: number; i?: number; p?: number; terminalVoltages: number[] } | undefined {
  const e = indexOf(src.compiled).element.get(partId);
  if (!e) return undefined;
  const tv = e.el.nodes.map((n) => nodeVoltage(src, n));
  const v = tv.length >= 2 ? tv[0] - tv[1] : undefined;
  const i = e.el.nodes.length ? terminalCurrent(src, partId, 0) : undefined;
  return { v, i, p: elementPower(src, partId), terminalVoltages: tv };
}

export function partReadings(src: LiveSource, part: Part): Reading[] {
  const vip = partVIP(src, part.id);
  if (!vip) return [];
  const out: Reading[] = [];
  const { v, i, p } = vip;
  if (v !== undefined) out.push({ key: "voltage", value: v, unit: "V" });
  else if (vip.terminalVoltages.length === 1) out.push({ key: "voltage", value: vip.terminalVoltages[0], unit: "V" });
  if (i !== undefined) out.push({ key: "current", value: i, unit: "A" });
  if (p !== undefined) out.push({ key: "power", value: p, unit: "W" });
  const C = num(part, "capacitance");
  if (part.type === "capacitor" && C !== undefined && v !== undefined) {
    out.push({ key: "charge", value: C * v, unit: "", suffix: "C" });
    out.push({ key: "energy", value: 0.5 * C * v * v, unit: "", suffix: "J" });
  }
  const L = num(part, "inductance");
  if (part.type === "inductor" && L !== undefined && i !== undefined) {
    out.push({ key: "flux", value: L * i, unit: "", suffix: "Wb" });
    out.push({ key: "energy", value: 0.5 * L * i * i, unit: "", suffix: "J" });
  }
  if ((part.type === "resistor" || part.type === "lamp") && v !== undefined && i !== undefined && Math.abs(i) > 1e-15) {
    out.push({ key: "resistance", value: v / i, unit: "ohm" });
  }
  return out;
}

export interface NodeReading {
  node: number;
  name: string;
  voltage: number;
  /** Wire segment current from its first point to its second (CAN-16). */
  segmentCurrent?: number;
}

export function nodeReading(src: LiveSource, node: number, seg?: { wire: string; segment: number }): NodeReading {
  const cc: CompiledCircuit = src.compiled;
  const s = seg && segmentOf(cc, seg.wire, seg.segment);
  return {
    node,
    name: cc.netlist.nodeNames[node] ?? `N${node}`,
    voltage: nodeVoltage(src, node),
    segmentCurrent: s ? segmentCurrent(src, s) : undefined,
  };
}
