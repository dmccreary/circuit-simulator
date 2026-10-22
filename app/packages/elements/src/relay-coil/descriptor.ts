import type { ElementDescriptor } from "../api";

export const RELAY_COIL_LENGTH = 4;

/** Coil types, in CircuitJS1 RelayCoilElm order (TYPE_NORMAL ... TYPE_LATCHING_OFF). */
export const RELAY_COIL_TYPES = ["normal", "on-delay", "off-delay", "latching", "latching-set", "latching-reset"];

/**
 * Relay coil after CircuitJS1's RelayCoilElm, for coils and contacts drawn
 * apart (RelayContactElm). Our parts cannot reach each other, so the link is
 * a net: the coil drives its "arm" terminal to 1 V when the armature is
 * pulled in and 0 V when released (0.5 V while a set/reset coil is idle),
 * through 1 kΩ; contacts whose "arm" terminal is on the same net (wire or
 * net label) follow it. `link` is CircuitJS1's label that pairs them.
 */
export const relayCoilDescriptor: ElementDescriptor = {
  type: "relay-coil",
  category: "switches",
  aliases: ["relay coil", "coil", "latching relay", "time delay relay"],
  labelPrefix: "K",
  terminals: [
    { name: "coil+", at: { x: 0, y: 0 } },
    { name: "coil-", at: { x: RELAY_COIL_LENGTH, y: 0 } },
    { name: "arm", at: { x: RELAY_COIL_LENGTH / 2, y: 1 } },
  ],
  stretchable: { min: 2, default: RELAY_COIL_LENGTH, terminals: [1], midTerminals: [2] },
  props: [
    { key: "link", unit: "", kind: "text", default: "K1" },
    { key: "coilType", unit: "", kind: "enum", options: RELAY_COIL_TYPES, default: "normal" },
    { key: "coilInductance", unit: "H", range: [1e-6, 100], default: 0.2 },
    { key: "coilResistance", unit: "ohm", range: [1e-3, 1e6], default: 20 },
    { key: "onCurrent", unit: "A", range: [1e-6, 100], default: 0.02 },
    { key: "offCurrent", unit: "A", range: [1e-6, 100], default: 0.015 },
    { key: "switchingTime", unit: "s", range: [0, 100], default: 0.005 },
    { key: "initiallyOn", unit: "", kind: "boolean", default: false },
  ],
  readouts: [
    { key: "coilCurrent", unit: "A" },
    { key: "position", unit: "" },
  ],
};
