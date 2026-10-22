import type { ElementDescriptor } from "../api";
import { npnDescriptor, pnpDescriptor } from "../bjt/descriptor";

/**
 * Darlington pair after CircuitJS1's DarlingtonElm: two transistors with
 * shared collectors, the first one's emitter driving the second one's base.
 * Terminals and drawing size are a single transistor's (B, C, E).
 */
function darlington(pnp: boolean): ElementDescriptor {
  const bjt = pnp ? pnpDescriptor : npnDescriptor;
  return {
    type: pnp ? "pnp-darlington" : "npn-darlington",
    category: "semiconductors",
    aliases: [pnp ? "pnp darlington" : "npn darlington", "darlington", "darlington pair", "tip120"],
    labelPrefix: "Q",
    terminals: bjt.terminals,
    stretchable: bjt.stretchable,
    props: [{ key: "beta", unit: "", range: [1, 1e5], default: 100, showOnCanvas: true }],
    readouts: [
      { key: "ib", unit: "A" },
      { key: "ic", unit: "A" },
      { key: "vbe", unit: "V" },
      { key: "vce", unit: "V" },
    ],
  };
}

export const npnDarlingtonDescriptor = darlington(false);
export const pnpDarlingtonDescriptor = darlington(true);
