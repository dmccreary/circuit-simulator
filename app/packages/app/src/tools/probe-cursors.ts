// PRB-05: each probe tool has its own pointer shape: a probe tip for
// voltage, an open clamp for current, a thermometer for power.

import type { Quantity } from "../probes/add";

const svg = (body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`,
  )}")`;

const outline = (d: string) => `<path d='${d}' stroke='white' stroke-width='4'/><path d='${d}' stroke='black' stroke-width='1.6'/>`;

const SHAPES: Record<Quantity, { body: string; hot: [number, number] }> = {
  // Probe tip: a pen-like probe whose point is the hot spot.
  voltage: { body: outline("M2 2 L9 9 M7 11 L13 5 L21 13 L15 19 Z"), hot: [2, 2] },
  // Open clamp: a ring with a gap, hot spot in its middle.
  current: { body: outline("M16 5 A7 7 0 1 0 19 12 M12 12 L12 12") + "<circle cx='12' cy='12' r='1.5' fill='black'/>", hot: [12, 12] },
  // Thermometer.
  power: { body: outline("M10 15 V4 A2 2 0 0 1 14 4 V15 A4 4 0 1 1 10 15 Z") + "<circle cx='12' cy='18' r='2' fill='red'/>", hot: [12, 18] },
  logic: { body: outline("M2 2 L9 9 M7 11 L13 5 L21 13 L15 19 Z"), hot: [2, 2] },
};

export function probeCursor(q: Quantity): string {
  const s = SHAPES[q];
  const fallback = q === "current" ? "cell" : "crosshair";
  return `${svg(s.body)} ${s.hot[0]} ${s.hot[1]}, ${fallback}`;
}
