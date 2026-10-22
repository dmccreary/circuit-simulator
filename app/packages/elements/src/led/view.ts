import { drawDiode } from "../diode/view";
import { line, polyline, twoTerminalView } from "../shared/viewKit";

export const ledView = twoTerminalView(
  (g, part) => {
    const c = drawDiode(g, part);
    // Two emission arrows pointing up and away.
    for (const dx of [-0.1, 0.35]) {
      line(g, c + dx, -0.7, c + dx + 0.4, -1.1);
      polyline(g, [
        [c + dx + 0.45, -1.15],
        [c + dx + 0.2, -1.05],
        [c + dx + 0.35, -0.9],
      ], true);
      g.fill("symbol");
    }
  },
  undefined,
  {
    drawLive(g, part, live) {
      const b = live.get("brightness") ?? 0;
      if (b <= 0) return;
      const c = (part.length ?? 4) / 2;
      g.beginPath();
      g.arc(c, 0, 0.9, 0, 2 * Math.PI);
      g.closePath();
      g.fill("glow", Math.min(1, b));
    },
    describe: (part, live) => {
      const values: Record<string, string | number> = { label: part.label, color: String(part.props.color ?? "red") };
      const b = live?.get("brightness");
      if (b !== undefined) values.brightness = Math.round(b * 100);
      return { key: "element.led.describe", values };
    },
  },
);
