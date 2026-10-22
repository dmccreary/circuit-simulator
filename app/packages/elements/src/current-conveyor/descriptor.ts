import type { ElementDescriptor } from "../api";

/**
 * Second-generation current conveyor (CCII), as CircuitJS1's CC2Elm: X
 * follows Y's voltage, Y draws no current, and Z carries `gain` times the
 * current into X (gain 1 for CCII+, -1 for CCII-). Pins sit where the chip
 * puts them: X and Y on the left, Z on the right.
 */
export const currentConveyorDescriptor: ElementDescriptor = {
  type: "current-conveyor",
  category: "semiconductors",
  aliases: ["current conveyor", "ccii", "cc2", "ccii+", "ccii-"],
  labelPrefix: "U",
  terminals: [
    { name: "X", at: { x: 0, y: 0 } },
    { name: "Y", at: { x: 0, y: 4 } },
    { name: "Z", at: { x: 6, y: 2 } },
  ],
  props: [{ key: "gain", unit: "", range: [-1e3, 1e3], default: 1 }],
  readouts: [
    { key: "vx", unit: "V" },
    { key: "ix", unit: "A" },
    { key: "iz", unit: "A" },
  ],
};
