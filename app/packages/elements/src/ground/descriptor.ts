import type { ElementDescriptor } from "../api";

export const groundDescriptor: ElementDescriptor = {
  type: "ground",
  category: "wiring",
  essentials: true,
  aliases: ["ground", "gnd", "earth", "0v"],
  hotkey: "g",
  labelPrefix: "",
  terminals: [{ name: "GND", at: { x: 0, y: 0 } }],
  props: [],
  readouts: [{ key: "current", unit: "A" }],
  traits: { netName: "GND" },
};
