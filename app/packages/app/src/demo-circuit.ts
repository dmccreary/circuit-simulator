import type { CircuitDocument, Part, PropValue, Rotation } from "@cs/model";
import { createDocument } from "@cs/model";

function part(id: string, type: string, label: string, x: number, y: number, rot: Rotation, props: Record<string, PropValue>, length?: number): Part {
  return { id, type, label, at: { x, y }, orientation: { rot, flip: false }, props, ...(length ? { length } : {}) };
}

/**
 * Built-in RC charging circuit shown on load: 10 V battery, switch (open),
 * 10 kΩ, 100 µF (τ = 1 s), ground, and a voltage probe across C1.
 */
export function rcChargingCircuit(): CircuitDocument {
  const parts = [
    part("V1", "battery", "V1", 0, 4, 90, { voltage: 10, internalResistance: 0 }, 4), // + at (0,4), − at (0,8)
    part("S1", "switch", "S1", 2, 0, 0, { closed: false, onResistance: 0 }, 4),
    part("R1", "resistor", "R1", 8, 0, 0, { resistance: 10e3 }, 4),
    part("C1", "capacitor", "C1", 16, 2, 90, { capacitance: 100e-6, initialVoltage: 0 }, 4),
    part("G1", "ground", "", 0, 10, 0, {}),
  ];
  const wires = [
    { id: "w1", points: [{ x: 0, y: 4 }, { x: 0, y: 0 }, { x: 2, y: 0 }] },
    { id: "w2", points: [{ x: 6, y: 0 }, { x: 8, y: 0 }] },
    { id: "w3", points: [{ x: 12, y: 0 }, { x: 16, y: 0 }, { x: 16, y: 2 }] },
    { id: "w4", points: [{ x: 16, y: 6 }, { x: 16, y: 10 }, { x: 0, y: 10 }] },
    { id: "w5", points: [{ x: 0, y: 10 }, { x: 0, y: 8 }] },
  ];
  return createDocument({
    meta: { title: "RC charging", description: "Close S1 to charge C1 through R1. τ = RC = 1 s." },
    parts: Object.fromEntries(parts.map((p) => [p.id, p])),
    wires: Object.fromEntries(wires.map((w) => [w.id, w])),
    lanes: [{ id: "L1", kind: "analog", yScale: { mode: "auto" } }],
    probes: {
      P1: {
        id: "P1",
        name: "V(C1)",
        quantity: "voltage",
        target: { kind: "across", part: "C1" },
        style: { color: "probe.1", width: 1.5 },
        lane: "L1",
        flag: { offset: { x: 2, y: -1 }, showValue: true },
        measurements: [],
      },
    },
    view: { center: { x: 8, y: 5 }, zoom: 2 },
  });
}
