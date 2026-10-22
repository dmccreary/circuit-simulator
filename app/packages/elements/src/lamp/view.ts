import { circle, leads, line, twoTerminalView } from "../shared/viewKit";

export const lampView = twoTerminalView(
  (g, part) => {
    const c = leads(g, part, 1);
    circle(g, c, 0, 1);
    const d = Math.SQRT1_2;
    line(g, c - d, -d, c + d, d);
    line(g, c - d, d, c + d, -d);
  },
  { key: "ratedPower", unit: "W", fallback: 3 },
  {
    // Brightness follows the filament temperature, which lags the power (ANI-17).
    drawLive(g, part, live) {
      const b = Math.min(1, live.get("brightness") ?? 0);
      if (b <= 0) return;
      const c = (part.length ?? 4) / 2;
      g.beginPath();
      g.arc(c, 0, 1.6, 0, 2 * Math.PI);
      g.closePath();
      g.fill("glow", 0.3 * b);
      g.beginPath();
      g.arc(c, 0, 1, 0, 2 * Math.PI);
      g.closePath();
      g.fill("glow", b);
    },
  },
);
