import type { ElementDescriptor } from "../../api";
import { LEVEL_PROPS } from "../levels";

/** A logic level the student toggles by clicking (control id "toggle", prop `high`). */
export const logicInputDescriptor: ElementDescriptor = {
  type: "logic-input",
  category: "logic",
  aliases: ["logic input", "logic switch", "input", "toggle input"],
  labelPrefix: "IN",
  terminals: [{ name: "out", at: { x: 0, y: 0 } }],
  props: [{ key: "high", unit: "", kind: "boolean", default: false }, ...LEVEL_PROPS],
  traits: { toggleProp: "high" },
  readouts: [
    { key: "state", unit: "" },
    { key: "voltage", unit: "V" },
  ],
};
