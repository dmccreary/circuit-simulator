import type { Part } from "@cs/model";
import type { ElementView } from "../api";
import { bool, str } from "../shared/props";
import { stretchOf } from "../shared/stretch";
import { circle, describePart, line } from "../shared/viewKit";
import { RELAY_CONTACT_LENGTH } from "./descriptor";

const lengthOf = (part: Part) => RELAY_CONTACT_LENGTH + stretchOf(part, RELAY_CONTACT_LENGTH);
const armX = (part: Part) => RELAY_CONTACT_LENGTH / 2 + Math.floor(stretchOf(part, RELAY_CONTACT_LENGTH) / 2);

/** A switch blade (shown released) with a dashed link down to the "arm" terminal. */
export const relayContactView: ElementView = {
  drawSymbol(g, part) {
    const L = lengthOf(part);
    const c = L / 2;
    const p0 = Math.max(0.2, c - 1);
    const p1 = Math.min(L - 0.2, c + 1);
    line(g, 0, 0, p0, 0);
    line(g, p1, 0, L, 0);
    circle(g, p0, 0, 0.1);
    circle(g, p1, 0, 0.1);
    if (bool(part.props, "normallyClosed", false)) line(g, p0, 0, p1 + 0.1, 0.15);
    else line(g, p0, 0, p1 - 0.1, -0.8);
    const ax = armX(part);
    for (let y = -0.3; y < 1; y += 0.3) line(g, ax, y, ax, Math.min(1, y + 0.15));
    g.text(str(part.props, "link", ""), c, -1, { align: "center", baseline: "bottom", color: "label" });
  },
  currentPaths: (part) => [{ points: [{ x: 0, y: 0 }, { x: lengthOf(part), y: 0 }], from: 0, to: 1 }],
  hitShape: (part) => ({ x: 0, y: -1, w: lengthOf(part), h: 2.1 }),
  describe: (part, live) => describePart(part, undefined, live),
};
