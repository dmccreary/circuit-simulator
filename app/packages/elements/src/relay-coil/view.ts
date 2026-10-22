import type { Part } from "@cs/model";
import type { ElementView } from "../api";
import { str } from "../shared/props";
import { stretchOf } from "../shared/stretch";
import { describePart, line, polyline } from "../shared/viewKit";
import { RELAY_COIL_LENGTH } from "./descriptor";

const lengthOf = (part: Part) => RELAY_COIL_LENGTH + stretchOf(part, RELAY_COIL_LENGTH);
const armX = (part: Part) => RELAY_COIL_LENGTH / 2 + Math.floor(stretchOf(part, RELAY_COIL_LENGTH) / 2);

/** A coil box between the leads with a dashed armature link to the "arm" terminal (RelayCoilElm). */
export const relayCoilView: ElementView = {
  drawSymbol(g, part) {
    const L = lengthOf(part);
    const c = L / 2;
    const w = Math.min(0.75, c - 0.2);
    line(g, 0, 0, c - w, 0);
    line(g, c + w, 0, L, 0);
    polyline(g, [[c - w, -0.6], [c + w, -0.6], [c + w, 0.6], [c - w, 0.6]], true);
    g.stroke("symbol");
    const type = str(part.props, "coilType", "normal");
    if (type.startsWith("latching")) {
      polyline(g, [[c - 0.4, 0.3], [c - 0.2, 0.3], [c + 0.2, -0.3], [c + 0.4, -0.3]]);
      g.stroke("symbol");
    } else polyline(g, [[c - w, 0.6], [c + w, -0.6]]);
    g.stroke("symbol");
    const ax = armX(part);
    for (let y = 0.65; y < 1; y += 0.3) line(g, ax, y, ax, Math.min(1, y + 0.15));
    g.text(str(part.props, "link", ""), c, -1, { align: "center", baseline: "bottom", color: "label" });
  },
  currentPaths: (part) => [{ points: [{ x: 0, y: 0 }, { x: lengthOf(part), y: 0 }], from: 0, to: 1 }],
  hitShape: (part) => ({ x: 0, y: -0.8, w: lengthOf(part), h: 1.9 }),
  describe: (part, live) => describePart(part, undefined, live),
};
