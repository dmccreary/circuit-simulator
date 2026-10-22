import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals, VIP } from "../shared/descriptorKit";

export const LED_COLORS = ["red", "orange", "yellow", "green", "blue", "white", "infrared", "custom"] as const;

/** Forward voltage at full-brightness current, by color. */
export const LED_FORWARD_VOLTAGE: Record<string, number> = {
  red: 1.8,
  orange: 2.0,
  yellow: 2.1,
  green: 2.2,
  blue: 2.8,
  white: 3.0,
  infrared: 1.2,
};

export const ledDescriptor: ElementDescriptor = {
  type: "led",
  category: "outputs",
  essentials: true,
  aliases: ["led", "light emitting diode", "light"],
  labelPrefix: "D",
  terminals: twoTerminals("A", "K"),
  stretchable: STRETCH,
  props: [
    { key: "color", unit: "", kind: "enum", options: [...LED_COLORS], default: "red", showOnCanvas: true },
    // Used only when color is "custom"; otherwise the color sets it.
    { key: "forwardVoltage", unit: "V", range: [0.5, 5], default: 1.8 },
    { key: "fullBrightnessCurrent", unit: "A", range: [1e-5, 1], default: 0.02 },
  ],
  readouts: [...VIP, { key: "brightness", unit: "" }],
};
