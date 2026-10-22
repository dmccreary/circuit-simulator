import type { ElementView } from "../../api";
import { line } from "../../shared/viewKit";
import { bubble, describeLogic, drawGate } from "../symbols";

function gateView(shape: "and" | "or" | "xor", inverted: boolean): ElementView {
  return {
    drawSymbol: (g) => drawGate(g, shape, inverted),
    currentPaths: () => [],
    hitShape: () => ({ x: 0, y: -0.6, w: 4, h: 3.2 }),
    describe: (part) => describeLogic(part),
  };
}

export const andGateView = gateView("and", false);
export const orGateView = gateView("or", false);
export const nandGateView = gateView("and", true);
export const norGateView = gateView("or", true);
export const xorGateView = gateView("xor", false);

export const notGateView: ElementView = {
  drawSymbol(g) {
    line(g, 0, 0, 1, 0);
    g.beginPath();
    g.moveTo(1, -1);
    g.lineTo(3.2, 0);
    g.lineTo(1, 1);
    g.closePath();
    g.stroke("symbol");
    line(g, bubble(g, 3.2, 0), 0, 4, 0);
  },
  currentPaths: () => [],
  hitShape: () => ({ x: 0, y: -1.1, w: 4, h: 2.2 }),
  describe: (part) => describeLogic(part),
};
