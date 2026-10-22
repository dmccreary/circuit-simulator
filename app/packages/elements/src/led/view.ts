import { drawDiode } from "../diode/view";
import { line, polyline, twoTerminalView } from "../shared/viewKit";
import { circlePath, fillCss } from "../shared/graphics-ext";
import { LED_CSS } from "../shared/symbols-lifelike";

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
    // Glow in the LED's own color, brightness on a perceptual scale (ANI-17).
    drawLive(g, part, live) {
      const b = Math.min(1, live.get("brightness") ?? 0);
      if (b <= 0) return;
      const c = (part.length ?? 4) / 2;
      const color = LED_CSS[String(part.props.color ?? "red")] ?? LED_CSS.red;
      circlePath(g, c, 0, 1.5);
      fillCss(g, color, "glow", 0.25 * b);
      circlePath(g, c, 0, 0.9);
      fillCss(g, color, "glow", 0.7 * b);
    },
    describe: (part, live) => {
      const values: Record<string, string | number> = { label: part.label, color: String(part.props.color ?? "red") };
      const b = live?.get("brightness");
      if (b !== undefined) values.brightness = Math.round(b * 100);
      return { key: "element.led.describe", values };
    },
  },
);
