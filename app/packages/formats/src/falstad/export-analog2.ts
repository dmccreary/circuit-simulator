// Falstad export candidates for the agent "analog2" parts (the inverse of
// mapping-analog2.ts). Each candidate is kept by export.ts only when it
// re-imports to the same placement.

import type { Part, Point } from "@cs/model";
import { escapeFalstad } from "./text";

const PX = 16;
type Num = number | string;

const n = (p: Part, key: string, fallback: number): number => {
  const v = p.props[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
};

/** Part frame -> document grid, as export.ts toDoc(). */
function toDoc(part: Part, x: number, y: number): Point {
  const y0 = part.orientation.flip ? -y : y;
  const r = part.orientation.rot;
  const [dx, dy] = r === 90 ? [-y0, x] : r === 180 ? [-x, -y0] : r === 270 ? [y0, -x] : [x, y0];
  return { x: part.at.x + dx, y: part.at.y + dy };
}

function line(code: string, a: Point, z: Point, flags: number, ...tokens: Num[]): string {
  return [code, a.x * PX, a.y * PX, z.x * PX, z.y * PX, flags, ...tokens].join(" ");
}

/** Candidate lines, or null when the part is not one of ours. */
export function analog2Candidates(part: Part): string[] | null {
  const L = part.length ?? 4;
  const P = part.at;
  const Q = toDoc(part, L, 0);
  const st = part.savedState ?? [];
  switch (part.type) {
    case "tunnel-diode":
      return [line("175", P, Q, 0)];
    case "varactor":
      return [line("176", P, Q, 1, n(part, "forwardVoltage", 0.805904783), st[0] ?? 0, n(part, "baseCapacitance", 4e-12))];
    case "polar-capacitor":
      return [
        line("209", P, Q, 4, n(part, "capacitance", 1e-5), st[0] ?? 0, n(part, "initialVoltage", 0), n(part, "seriesResistance", 0), n(part, "maxReverseVoltage", 1)),
      ];
    case "spark-gap":
      return [line("187", P, Q, 0, n(part, "onResistance", 1e3), n(part, "offResistance", 1e9), n(part, "breakdownVoltage", 1e3), n(part, "holdingCurrent", 0.001))];
    case "diac":
      return [line("203", P, Q, 0, n(part, "onResistance", 500), n(part, "offResistance", 1e8), n(part, "breakdownVoltage", 30), n(part, "holdingCurrent", 0.01))];
    case "crystal": {
      const cs = n(part, "seriesCapacitance", 1e-13);
      const f = n(part, "frequency", 1e7);
      const l = 1 / ((2 * Math.PI * f) ** 2 * cs);
      const dumps = [`0 ${n(part, "parallelCapacitance", 2.87e-11)} ${st[0] ?? 0}`, `0 ${cs} ${st[4] ?? 0}`, `0 ${l} ${st[3] ?? 0}`, `0 ${n(part, "resistance", 6.4)}`];
      return [line("412", P, Q, 1 | 2, ...dumps.map(escapeFalstad))];
    }
    case "scr":
    case "triac": {
      // point2 one unit off the axis on the gate's side tells Falstad where the gate goes (FLAG_GATE_FIX for SCRElm).
      const tok =
        part.type === "scr"
          ? ["177", 1, 0, 0, n(part, "triggerCurrent", 0.01), n(part, "holdingCurrent", 0.0082), n(part, "gateResistance", 50)]
          : ["206", 0, n(part, "triggerCurrent", 0.01), n(part, "holdingCurrent", 0.0082), n(part, "gateResistance", 100), part.props.on === true ? "true" : "false"];
      const [code, flags, ...rest] = tok as [string, number, ...Num[]];
      return [1, -1].map((side) => line(code, P, toDoc(part, L, side), flags, ...rest));
    }
    case "triode":
      return [0, 1].map((f) => line("173", P, Q, f, n(part, "mu", 93), n(part, "kg1", 680)));
    case "unijunction":
      return [0, 2].map((f) => line("417", P, Q, f));
    case "antenna":
      return [line("A", P, Q, 0)];
    default:
      return null;
  }
}
