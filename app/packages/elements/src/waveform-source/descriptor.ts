import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals, VIP } from "../shared/descriptorKit";
import { RAIL_WAVEFORMS } from "../rail/descriptor";

/**
 * A two-terminal function generator with every waveform of CircuitJS1's
 * VoltageElm (triangle, sawtooth, pulse, noise, as well as DC, sine, square),
 * using the rail's waveform code. "+" is terminal 0.
 */
export const waveformSourceDescriptor: ElementDescriptor = {
  type: "waveform-source",
  category: "sources",
  aliases: ["function generator", "signal generator", "triangle wave", "sawtooth", "pulse", "noise", "waveform"],
  labelPrefix: "V",
  terminals: twoTerminals("+", "-"),
  stretchable: STRETCH,
  props: [
    { key: "waveform", unit: "", kind: "enum", options: [...RAIL_WAVEFORMS], default: "triangle" },
    { key: "voltage", unit: "V", range: [-1e5, 1e5], default: 5, sliderable: true, showOnCanvas: true },
    { key: "offset", unit: "V", range: [-1e5, 1e5], default: 0, sliderable: true },
    { key: "frequency", unit: "Hz", range: [1e-3, 1e10], default: 40, sliderable: true, showOnCanvas: true },
    { key: "phase", unit: "", range: [-360, 360], default: 0 },
    { key: "dutyCycle", unit: "%", range: [0, 100], default: 50 },
    { key: "maxFrequency", unit: "Hz", range: [1e-3, 1e10], default: 4000 },
    { key: "sweepTime", unit: "s", range: [1e-9, 1e4], default: 0.5 },
    { key: "logSweep", unit: "", kind: "boolean", default: true },
  ],
  readouts: VIP,
  traits: { voltageSource: true },
};
