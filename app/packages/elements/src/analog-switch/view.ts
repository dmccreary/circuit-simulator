import type { Part } from "@cs/model";
import type { ElementView } from "../api";
import { stretchOf } from "../shared/stretch";
import { circle, describePart, line } from "../shared/viewKit";
import { ANALOG_SWITCH_LENGTH } from "./descriptor";

const lengthOf = (part: Part) => ANALOG_SWITCH_LENGTH + stretchOf(part, ANALOG_SWITCH_LENGTH);
const ctlX = (part: Part) => ANALOG_SWITCH_LENGTH / 2 + Math.floor(stretchOf(part, ANALOG_SWITCH_LENGTH) / 2);

function contactsSpan(L: number) {
  const c = L / 2;
  return { p: Math.max(0.3, c - 1), q: Math.min(L - 0.3, c + 1) };
}

export const analogSwitchView: ElementView = {
  drawSymbol(g, part) {
    const L = lengthOf(part);
    const { p, q } = contactsSpan(L);
    line(g, 0, 0, p, 0);
    line(g, q, 0, L, 0);
    circle(g, p, 0, 0.12);
    circle(g, q, 0, 0.12);
    line(g, p, 0, q - 0.15, -0.7);
    // Control lead up to the blade, dashed.
    const x = ctlX(part);
    for (let y = 1; y > -0.2; y -= 0.4) line(g, x, y, x, y - 0.2);
  },
  currentPaths: () => [],
  hitShape: (part) => ({ x: 0, y: -1, w: lengthOf(part), h: 2.2 }),
  describe: (part, live) => describePart(part, undefined, live),
};

export const analogSwitch2View: ElementView = {
  drawSymbol(g, part) {
    const L = lengthOf(part);
    const { p, q } = contactsSpan(L);
    line(g, 0, 0, p, 0);
    circle(g, p, 0, 0.12);
    for (const y of [-1, 1]) {
      circle(g, q, y, 0.12);
      line(g, q, y, L, y);
    }
    line(g, p, 0, q - 0.1, 0.9);
    const x = ctlX(part);
    for (let y = -1; y < 0.2; y += 0.4) line(g, x, y, x, y + 0.2);
  },
  currentPaths: () => [],
  hitShape: (part) => ({ x: 0, y: -1.2, w: lengthOf(part), h: 2.4 }),
  describe: (part, live) => describePart(part, undefined, live),
};
