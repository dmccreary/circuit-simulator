import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals } from "../shared/descriptorKit";

export const switchDescriptor: ElementDescriptor = {
  type: "switch",
  category: "switches",
  essentials: true,
  aliases: ["switch", "spst", "toggle"],
  hotkey: "s",
  labelPrefix: "S",
  terminals: twoTerminals(),
  stretchable: STRETCH,
  props: [
    { key: "closed", unit: "", kind: "boolean", default: false },
    { key: "onResistance", unit: "ohm", range: [0, 1e6], default: 0, realisticDefault: 0.05 },
  ],
  readouts: [
    { key: "closed", unit: "" },
    { key: "voltage", unit: "V" },
    { key: "current", unit: "A" },
  ],
  traits: { shortWhenProp: "closed" },
};
