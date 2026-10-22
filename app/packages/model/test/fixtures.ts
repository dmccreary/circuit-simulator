// A fake PartResolver standing in for @cs/elements' createPartResolver().
import type { CircuitDocument, Part, PartResolver, PartTraits, Point, Wire } from "@cs/model";
import { createDocument } from "@cs/model";

const TRAITS: Record<string, PartTraits> = {
  resistor: { known: true },
  capacitor: { known: true },
  vsource: { known: true, voltageSource: true },
  isource: { known: true, currentSource: true },
  ground: { known: true, netName: "GND" },
  rail: { known: true },
  switch: { known: true, shorts: (p) => (p.closed ? [[0, 1]] : []) },
  ammeter: { known: true, ammeter: true },
  voltmeter: { known: true, voltmeter: true },
  gate: { known: true, digitalPins: [0, 1] },
  subcircuit: { known: true },
};

function rotate(d: Point, rot: number): Point {
  switch (rot) {
    case 90:
      return { x: -d.y, y: d.x };
    case 180:
      return { x: -d.x, y: -d.y };
    case 270:
      return { x: d.y, y: -d.x };
    default:
      return d;
  }
}

export const resolver: PartResolver = {
  traits: (type) => TRAITS[type] ?? { known: false },
  terminals(part: Part): Point[] {
    if (!TRAITS[part.type]) return [];
    if (part.type === "ground" || part.type === "rail") return [part.at];
    if (part.type === "subcircuit") {
      const n = Number(part.props.pins ?? 0);
      return Array.from({ length: n }, (_, i) => ({ x: part.at.x, y: part.at.y + i * 2 }));
    }
    const d = rotate({ x: part.length ?? 4, y: 0 }, part.orientation.rot);
    return [part.at, { x: part.at.x + d.x, y: part.at.y + d.y }];
  },
};

export function part(id: string, type: string, x: number, y: number, extra: Partial<Part> = {}): Part {
  return { id, type, label: extra.label ?? id.toUpperCase(), at: { x, y }, orientation: { rot: 0, flip: false }, props: {}, ...extra };
}

export function wire(id: string, ...pts: [number, number][]): Wire {
  return { id, points: pts.map(([x, y]) => ({ x, y })) };
}

export function doc(parts: Part[], wires: Wire[] = [], extra: Partial<CircuitDocument> = {}): CircuitDocument {
  return createDocument({
    parts: Object.fromEntries(parts.map((p) => [p.id, p])),
    wires: Object.fromEntries(wires.map((w) => [w.id, w])),
    ...extra,
  });
}

/**
 * Series loop V1 -> C1 -> R1, grounded at V1 terminal 0.
 *   V1: (0,0)-(4,0)   C1: (8,0)-(8,4)   R1: (4,8)-(0,8)   ground at (0,8)
 */
export function rcLoop(): CircuitDocument {
  return doc(
    [
      part("v1", "vsource", 0, 0, { props: { voltage: 5 } }),
      part("r1", "resistor", 4, 8, { orientation: { rot: 180, flip: false }, props: { resistance: 1000 } }),
      part("c1", "capacitor", 8, 0, { orientation: { rot: 90, flip: false }, props: { capacitance: 1e-6 } }),
      part("g1", "ground", 0, 8, { label: "" }),
    ],
    [
      wire("w1", [4, 0], [8, 0]), // V1+ to C1 top
      wire("w2", [8, 4], [8, 8], [4, 8]), // C1 bottom to R1 start
      wire("w3", [0, 0], [0, 8]), // V1- (at 0,0) down to R1 end and ground
    ],
  );
}
