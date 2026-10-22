import type { ElementView } from "../api";
import { compileExpr, newExprState } from "../expression-source/expr";
import { describeLogic } from "../logic/symbols";
import { num, str } from "../shared/props";
import { line } from "../shared/viewKit";
import { INSTRUCTION_DISPLAY_WIDTHS, instructionDisplayType } from "./descriptor";

const parseNumber = (s: string): number => {
  const t = s.trim();
  if (/^0x/i.test(t)) return parseInt(t.slice(2), 16);
  if (/^0b/i.test(t)) return parseInt(t.slice(2), 2);
  return /^-?\d+$/.test(t) ? Number(t) : NaN;
};

/** InstructionDisplayElm.getDisplayText(): the first entry whose range holds the value. */
export function displayText(lookup: string, value: number): string {
  for (const raw of lookup.split("\n")) {
    const line = raw.trim();
    const eq = line.indexOf("=");
    if (!line || eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const dash = key.indexOf("-", /^0[xb]/i.test(key) ? 2 : 0);
    const lo = parseNumber(dash >= 0 ? key.slice(0, dash) : key);
    const hi = dash >= 0 ? parseNumber(key.slice(dash + 1)) : lo;
    if (!(value >= lo && value <= hi)) continue;
    return line.slice(eq + 1).replace(/\{([^}]*)\}/g, (m, src: string) => {
      try {
        const s = newExprState();
        s.values[0] = value;
        const r = compileExpr(src)(s);
        return Number.isFinite(r) ? String(r) : m;
      } catch {
        return m;
      }
    });
  }
  return String(value);
}

function view(width: number): ElementView {
  return {
    drawSymbol(g) {
      line(g, 0, 0, width - 1, 0);
      g.beginPath();
      g.moveTo(0, 0.08);
      g.lineTo(width - 1, 0.08);
      g.stroke("symbol", 2);
    },
    drawLive(g, part, live) {
      const th = num(part.props, "threshold", 2.5);
      let v = 0;
      for (let z = 0; z < width; z++) if ((live.terminalVoltages[z] ?? 0) > th) v |= 1 << z;
      g.text(displayText(str(part.props, "lookup", ""), v), width, 0, { size: 0.9, align: "left", baseline: "middle", color: "value" });
    },
    currentPaths: () => [],
    hitShape: () => ({ x: 0, y: -1, w: width + 6, h: 2 }),
    describe: (part) => describeLogic(part),
  };
}

export const INSTRUCTION_DISPLAY_VIEWS: Record<string, ElementView> = Object.fromEntries(
  INSTRUCTION_DISPLAY_WIDTHS.map((w) => [instructionDisplayType(w), view(w)]),
);
