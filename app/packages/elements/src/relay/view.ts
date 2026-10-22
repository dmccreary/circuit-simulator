import type { Part } from "@cs/model";
import type { ElementView } from "../api";
import { stretchOf } from "../shared/stretch";
import { circle, describePart, line, polyline } from "../shared/viewKit";
import { RELAY_LENGTH, relayPoles } from "./descriptor";

const lengthOf = (part: Part) => RELAY_LENGTH + stretchOf(part, RELAY_LENGTH);

/** Contacts for each pole (shown in the off position), a coil box below, and a dashed linkage. */
export const relayView: ElementView = {
  drawSymbol(g, part) {
    const L = lengthOf(part);
    const poles = relayPoles(part.type);
    const c = L / 2;
    const pivot = Math.max(0.3, c - 1);
    const contact = Math.min(L - 0.3, c + 1);
    for (let i = 0; i < poles; i++) {
      const y0 = -3 * i;
      line(g, 0, y0, pivot, y0);
      circle(g, pivot, y0, 0.12);
      for (const dy of [-1, 1]) {
        circle(g, contact, y0 + dy, 0.12);
        line(g, contact, y0 + dy, L, y0 + dy);
      }
      line(g, pivot, y0, contact - 0.1, y0 - 0.9);
    }
    // Coil: leads to a box centred between its terminals.
    line(g, 0, 2, c - 1, 2);
    line(g, c + 1, 2, L, 2);
    polyline(g, [[c - 1, 1.5], [c + 1, 1.5], [c + 1, 2.5], [c - 1, 2.5]], true);
    g.stroke("symbol");
    polyline(g, [[c - 1, 2.5], [c + 1, 1.5]]);
    g.stroke("symbol");
    // Linkage from the coil to the blades.
    for (let y = 1.3; y > -3 * (poles - 1) - 0.4; y -= 0.5) line(g, c, y, c, y - 0.25);
  },
  currentPaths: () => [],
  hitShape: (part) => {
    const poles = relayPoles(part.type);
    const top = -3 * (poles - 1) - 1.3;
    return { x: 0, y: top, w: lengthOf(part), h: 2.8 - top };
  },
  describe: (part, live) => describePart(part, undefined, live),
};
