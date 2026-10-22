import type { Part } from "@cs/model";
import type { ElementView } from "../api";
import { chipHitShape, drawChip } from "../chip-kit/view";
import { describeLogic } from "../logic/symbols";
import { str } from "../shared/props";
import { CUSTOM_LOGIC_SIZES, customLogicSpec, customLogicType } from "./descriptor";

const names = (part: Part, key: string): string[] | undefined => {
  const s = str(part.props, key, "");
  return s ? s.split(",") : undefined;
};

/** Pin names come from the part's inputNames / outputNames (CustomLogicModel inputs, outputs). */
function view(inputs: number, outputs: number): ElementView {
  const spec = customLogicSpec(inputs, outputs);
  return {
    drawSymbol(g, part) {
      const s = customLogicSpec(inputs, outputs, names(part, "inputNames"), names(part, "outputNames"));
      s.title = str(part.props, "title", "");
      drawChip(g, s);
    },
    currentPaths: () => [],
    hitShape: () => chipHitShape(spec),
    describe: (part) => describeLogic(part),
  };
}

export const CUSTOM_LOGIC_VIEWS: Record<string, ElementView> = Object.fromEntries(
  CUSTOM_LOGIC_SIZES.map(([i, o]) => [customLogicType(i, o), view(i, o)]),
);
