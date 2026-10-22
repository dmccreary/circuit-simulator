import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals, VIP } from "../shared/descriptorKit";

export const squareSourceDescriptor: ElementDescriptor = {
  type: "square-source",
  category: "sources",
  aliases: ["square wave", "square", "pulse", "clock source"],
  labelPrefix: "V",
  terminals: twoTerminals("+", "-"),
  stretchable: STRETCH,
  props: [
    { key: "amplitude", unit: "V", range: [-1e5, 1e5], default: 5, sliderable: true, showOnCanvas: true },
    { key: "frequency", unit: "Hz", range: [1e-3, 1e10], default: 1000, sliderable: true, showOnCanvas: true },
    { key: "offset", unit: "V", range: [-1e5, 1e5], default: 0, sliderable: true },
    { key: "phase", unit: "", range: [-360, 360], default: 0 },
    { key: "dutyCycle", unit: "%", range: [0, 100], default: 50, sliderable: true },
  ],
  readouts: [...VIP, { key: "frequency", unit: "Hz" }],
  traits: { voltageSource: true },
};
