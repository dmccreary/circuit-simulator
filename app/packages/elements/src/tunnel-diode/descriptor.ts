import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals, VIP } from "../shared/descriptorKit";

/**
 * Tunnel (Esaki) diode, as CircuitJS1's TunnelDiodeElm: a fixed I-V curve with
 * a 4.7 mA peak near 0.1 V, a valley near 0.37 V, and a negative-resistance
 * region between them. No adjustable parameters, like the original.
 */
export const tunnelDiodeDescriptor: ElementDescriptor = {
  type: "tunnel-diode",
  category: "semiconductors",
  aliases: ["tunnel diode", "esaki diode", "negative resistance"],
  labelPrefix: "D",
  terminals: twoTerminals("A", "K"),
  stretchable: STRETCH,
  props: [],
  readouts: [...VIP],
};
