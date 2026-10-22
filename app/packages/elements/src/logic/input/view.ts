import type { Part } from "@cs/model";
import type { ControlRegion, ElementView } from "../../api";
import { bool } from "../../shared/props";
import { line } from "../../shared/viewKit";
import { describeLogic, drawBox } from "../symbols";

const BODY = { x: -2.6, y: -0.8, w: 2, h: 1.6 };
const isHigh = (part: Part) => bool(part.props, "high", false);

export const logicInputView: ElementView = {
  drawSymbol(g, part) {
    drawBox(g, BODY.x, BODY.y, BODY.x + BODY.w, BODY.y + BODY.h);
    line(g, BODY.x + BODY.w, 0, 0, 0);
    g.text(isHigh(part) ? "1" : "0", BODY.x + BODY.w / 2, 0, { size: 1, align: "center", baseline: "middle", color: "value" });
  },
  currentPaths: () => [],
  controls: (): ControlRegion[] => [{ id: "toggle", shape: BODY }],
  hitShape: () => ({ x: BODY.x, y: BODY.y, w: -BODY.x, h: BODY.h }),
  describe: (part) => {
    const ref = describeLogic(part);
    ref.values!.state = isHigh(part) ? 1 : 0;
    return ref;
  },
};
