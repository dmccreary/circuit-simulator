import type { ElementDescriptor } from "../../api";
import { LEVEL_PROPS } from "../levels";

/** Square-wave logic source (DIG-06): frequency, duty cycle, start phase. */
export const clockDescriptor: ElementDescriptor = {
  type: "clock",
  category: "logic",
  aliases: ["clock", "clk", "logic clock"],
  labelPrefix: "CLK",
  terminals: [{ name: "out", at: { x: 0, y: 0 } }],
  props: [
    { key: "frequency", unit: "Hz", range: [1e-3, 1e9], default: 1000, showOnCanvas: true },
    { key: "dutyCycle", unit: "%", range: [0, 100], default: 50 },
    { key: "phase", unit: "", range: [0, 360], default: 0 },
    ...LEVEL_PROPS,
  ],
  readouts: [
    { key: "state", unit: "" },
    { key: "frequency", unit: "Hz" },
  ],
};
