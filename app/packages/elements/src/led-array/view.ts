import type { ElementView } from "../api";
import { chipView } from "../chip-kit/view";
import { LED_ARRAY_SIZES, ledArraySpec, ledArrayType } from "./descriptor";

const R = 0.7;

/** LED dots at the column/row crossings (LEDArrayElm.draw), lit by the brightness readouts. */
function view(cols: number, rows: number): ElementView {
  const base = chipView(ledArraySpec(cols, rows), (g, _part, live) => {
    for (let i = 0; i < cols * rows; i++) {
      const b = live.get(`b${i}`) ?? 0;
      if (b <= 0.02) continue;
      g.beginPath();
      g.arc(2 + 2 * (i % cols), 2 * Math.floor(i / cols), R, 0, 2 * Math.PI);
      g.closePath();
      g.fill("glow", Math.min(1, 0.25 + b));
    }
  });
  return {
    ...base,
    drawSymbol(g, part, style) {
      base.drawSymbol(g, part, style);
      // Unlit LED outlines, in the chip frame shifted to terminal 0 (column 0 at the bottom).
      for (let i = 0; i < cols * rows; i++) {
        const x = 2 * (i % cols);
        const y = 2 * Math.floor(i / cols) - 2 * rows;
        g.beginPath();
        g.arc(x, y, R, 0, 2 * Math.PI);
        g.closePath();
        g.stroke("symbol");
      }
    },
  };
}

export const LED_ARRAY_VIEWS: Record<string, ElementView> = Object.fromEntries(
  LED_ARRAY_SIZES.map(([c, r]) => [ledArrayType(c, r), view(c, r)]),
);
