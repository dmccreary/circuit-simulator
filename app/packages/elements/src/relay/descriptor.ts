import type { ElementDescriptor, TerminalSpec } from "../api";

export const RELAY_LENGTH = 4;
/** Pole counts offered as part types ("relay" has one pole, "relay-2" two...). */
export const RELAY_POLES = [1, 2, 3, 4] as const;

/** Number of poles encoded in a relay type. */
export const relayPoles = (type: string): number => {
  const m = /^relay-(\d)$/.exec(type);
  return m ? Number(m[1]) : 1;
};

/**
 * Terminals follow CircuitJS1's RelayElm post order and places (coil drawn on
 * both sides, FLAG_BOTH_SIDES_COIL): for each pole i a common terminal at
 * (0, -3i), throw A (closed when the relay is off) at (L, -3i-1) and throw B
 * (closed when on) at (L, -3i+1); then the coil from (0, 2) to (L, 2).
 */
function relay(poles: number): ElementDescriptor {
  const terminals: TerminalSpec[] = [];
  const moving: number[] = [];
  for (let i = 0; i < poles; i++) {
    const n = poles > 1 ? String(i + 1) : "";
    terminals.push({ name: `C${n}`, at: { x: 0, y: -3 * i + 0 } });
    terminals.push({ name: `A${n}`, at: { x: RELAY_LENGTH, y: -3 * i - 1 } });
    terminals.push({ name: `B${n}`, at: { x: RELAY_LENGTH, y: -3 * i + 1 } });
    moving.push(3 * i + 1, 3 * i + 2);
  }
  terminals.push({ name: "coil+", at: { x: 0, y: 2 } }, { name: "coil-", at: { x: RELAY_LENGTH, y: 2 } });
  moving.push(3 * poles + 1);
  return {
    type: poles === 1 ? "relay" : `relay-${poles}`,
    category: "switches",
    aliases: poles === 1 ? ["relay", "electromagnetic relay", "spdt relay"] : [`${poles}-pole relay`, "relay"],
    labelPrefix: "K",
    terminals,
    stretchable: { min: 2, default: RELAY_LENGTH, terminals: moving },
    props: [
      { key: "coilInductance", unit: "H", range: [1e-6, 100], default: 0.2 },
      { key: "coilResistance", unit: "ohm", range: [1e-3, 1e6], default: 20 },
      { key: "onCurrent", unit: "A", range: [1e-6, 100], default: 0.02 },
      { key: "offCurrent", unit: "A", range: [1e-6, 100], default: 0.015 },
      { key: "switchingTime", unit: "s", range: [0, 10], default: 0.005 },
      { key: "onResistance", unit: "ohm", range: [1e-6, 1e3], default: 0.05 },
      { key: "offResistance", unit: "ohm", range: [1, 1e12], default: 1e6 },
    ],
    readouts: [
      { key: "position", unit: "" },
      { key: "coilCurrent", unit: "A" },
    ],
  };
}

export const RELAY_DESCRIPTORS: ElementDescriptor[] = RELAY_POLES.map(relay);
