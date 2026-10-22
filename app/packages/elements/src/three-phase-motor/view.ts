import type { Part } from "@cs/model";
import type { ElementView } from "../api";
import { stretchOf } from "../shared/stretch";
import { circle, describePart, line } from "../shared/viewKit";
import { MOTOR_LENGTH } from "./descriptor";

const lengthOf = (part: Part) => MOTOR_LENGTH + stretchOf(part, MOTOR_LENGTH);

/** A round motor body with three leads on each side; the rotor turns with the angle readout. */
export const threePhaseMotorView: ElementView = {
  drawSymbol(g, part) {
    const L = lengthOf(part);
    const c = L / 2;
    const r = Math.min(2.3, c - 0.3);
    for (const y of [0, 2, 4]) {
      const dx = Math.sqrt(Math.max(0, r * r - (y - 2) ** 2));
      line(g, 0, y, c - dx, y);
      line(g, c + dx, y, L, y);
    }
    circle(g, c, 2, r);
    circle(g, c, 2, r / 2.2);
    g.text("3~", c, 2, { size: 0.7, align: "center", baseline: "middle", color: "label" });
    for (const [y, a, b] of [[0, "U1", "W2"], [2, "V1", "V2"], [4, "W1", "U2"]] as const) {
      g.text(a, 0.2, y - 0.15, { size: 0.45, baseline: "bottom", color: "label" });
      g.text(b, L - 0.2, y - 0.15, { size: 0.45, align: "right", baseline: "bottom", color: "label" });
    }
  },
  drawLive(g, part, live) {
    const a = live.get("angle");
    if (a === undefined) return;
    const c = lengthOf(part) / 2;
    const q = Math.min(2.3, c - 0.3) / 2.2;
    for (let k = 0; k < 3; k++) {
      const t = a + (k * Math.PI) / 3;
      line(g, c - q * Math.cos(t), 2 - q * Math.sin(t), c + q * Math.cos(t), 2 + q * Math.sin(t));
    }
  },
  currentPaths: () => [],
  hitShape: (part) => ({ x: 0, y: -0.4, w: lengthOf(part), h: 4.8 }),
  describe: (part, live) => describePart(part, undefined, live),
};
