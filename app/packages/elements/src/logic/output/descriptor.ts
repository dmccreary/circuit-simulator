import type { ElementDescriptor } from "../../api";
import { LEVEL_PROPS, TIMING_PROPS } from "../levels";

/** Lamp-like indicator showing the logic state of its input. */
export const logicOutputDescriptor: ElementDescriptor = {
  type: "logic-output",
  category: "logic",
  aliases: ["logic output", "logic probe", "indicator", "output"],
  labelPrefix: "OUT",
  terminals: [{ name: "in", at: { x: 0, y: 0 } }],
  props: [...TIMING_PROPS.filter((p) => p.key === "schmitt"), ...LEVEL_PROPS.filter((p) => p.key !== "outputResistance")],
  readouts: [
    { key: "state", unit: "" },
    { key: "voltage", unit: "V" },
  ],
};
