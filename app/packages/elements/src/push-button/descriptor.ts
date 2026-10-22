import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals } from "../shared/descriptorKit";

// No shortWhenProp: closed is `pressed !== normallyClosed`; the resolver handles it.
export const pushButtonDescriptor: ElementDescriptor = {
  type: "push-button",
  category: "switches",
  essentials: true,
  aliases: ["push button", "button", "pushbutton", "momentary"],
  labelPrefix: "S",
  terminals: twoTerminals(),
  stretchable: STRETCH,
  props: [
    { key: "pressed", unit: "", kind: "boolean", default: false },
    { key: "normallyClosed", unit: "", kind: "boolean", default: false },
    { key: "onResistance", unit: "ohm", range: [0, 1e6], default: 0 },
  ],
  readouts: [
    { key: "closed", unit: "" },
    { key: "voltage", unit: "V" },
    { key: "current", unit: "A" },
  ],
};
