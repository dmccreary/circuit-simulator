import type { ElementDescriptor } from "../api";

export const RELAY_CONTACT_LENGTH = 4;

/**
 * Relay contact after CircuitJS1's RelayContactElm: a switch from "1" to "2"
 * that closes while its "arm" terminal is driven high by a relay coil
 * (../relay-coil) and opens when it is driven low (the reverse when
 * normallyClosed). Between 0.35 V and 0.65 V it keeps its position.
 */
export const relayContactDescriptor: ElementDescriptor = {
  type: "relay-contact",
  category: "switches",
  aliases: ["relay contact", "contact", "relay switch"],
  labelPrefix: "K",
  terminals: [
    { name: "1", at: { x: 0, y: 0 } },
    { name: "2", at: { x: RELAY_CONTACT_LENGTH, y: 0 } },
    { name: "arm", at: { x: RELAY_CONTACT_LENGTH / 2, y: 1 } },
  ],
  stretchable: { min: 2, default: RELAY_CONTACT_LENGTH, terminals: [1], midTerminals: [2] },
  props: [
    { key: "link", unit: "", kind: "text", default: "K1" },
    { key: "normallyClosed", unit: "", kind: "boolean", default: false },
    { key: "onResistance", unit: "ohm", range: [1e-6, 1e3], default: 0.05 },
    { key: "offResistance", unit: "ohm", range: [1, 1e12], default: 1e6 },
    { key: "initiallyEnergized", unit: "", kind: "boolean", default: false },
  ],
  readouts: [
    { key: "closed", unit: "" },
    { key: "current", unit: "A" },
  ],
};
