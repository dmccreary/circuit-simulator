import type { Part } from "@cs/model";
import type { ControlRegion, ElementView } from "../api";
import { stretchOf } from "../shared/stretch";
import { circle, line } from "../shared/viewKit";
import { SPDT_LENGTH, spdtSelected } from "./descriptor";

const lengthOf = (part: Part) => SPDT_LENGTH + stretchOf(part, SPDT_LENGTH);

/** Pivot and two contacts centred between the common lead and the throws. */
function geometry(part: Part) {
  const L = lengthOf(part);
  const c = L / 2;
  return { L, pivot: Math.max(0.3, c - 1), contact: Math.min(L - 0.3, c + 1) };
}

export const spdtSwitchView: ElementView = {
  drawSymbol(g, part) {
    const { L, pivot, contact } = geometry(part);
    line(g, 0, 0, pivot, 0);
    circle(g, pivot, 0, 0.12);
    for (const y of [-1, 1]) {
      circle(g, contact, y, 0.12);
      line(g, contact, y, L, y);
    }
    const y = spdtSelected(part.props) === 2 ? 1 : -1;
    line(g, pivot, 0, contact - 0.1, y * 0.9);
  },
  currentPaths: (part) => {
    const { L, pivot, contact } = geometry(part);
    const sel = spdtSelected(part.props);
    const y = sel === 2 ? 1 : -1;
    return [
      {
        points: [{ x: 0, y: 0 }, { x: pivot, y: 0 }, { x: contact, y }, { x: L, y }],
        from: 0,
        to: sel,
      },
    ];
  },
  controls: (part): ControlRegion[] => {
    const { pivot, contact } = geometry(part);
    return [{ id: "toggle", shape: { x: pivot - 0.2, y: -1.2, w: contact - pivot + 0.4, h: 2.4 } }];
  },
  hitShape: (part) => ({ x: 0, y: -1.3, w: lengthOf(part), h: 2.6 }),
  describe: (part) => ({
    key: "element.spdt-switch.describe",
    values: { label: part.label, state: spdtSelected(part.props) === 2 ? "B" : "A" },
  }),
};
