// Falstad export candidates for the "analogic" parts (the inverse of
// mapping-analogic.ts). Each candidate is kept by export.ts only when it
// re-imports to the same placement. GyratorElm and NortonAmpElm have no text
// form and are not written.

import type { Part, Point } from "@cs/model";
import { escapeFalstad } from "./text";

const PX = 16;
type Num = number | string;

const n = (p: Part, key: string, fallback: number): number => {
  const v = p.props[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
};
const s = (p: Part, key: string, fallback: string): string => (typeof p.props[key] === "string" ? (p.props[key] as string) : fallback);
const b = (p: Part, key: string): boolean => p.props[key] === true;

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

const COIL_TYPES = ["normal", "on-delay", "off-delay", "latching", "latching-set", "latching-reset"];
/** OTAElm's model string transistor polarities, in order (N = 1, P = -1). */
const OTA_PNP = [1, 1, 1, 1, 1, -1, -1, -1, -1, -1, -1, 1, 1, 1, 1, 1];

/** Candidate lines, or null when the part is not one of ours. */
export function analogicCandidates(part: Part): string[] | null {
  const L = part.length ?? 4;
  const P = part.at;
  const Q = toDoc(part, L, 0);
  const right = (dx: number): Point => ({ x: P.x + dx, y: P.y });
  switch (part.type) {
    case "schmitt-trigger":
    case "inverting-schmitt-trigger":
      return [
        line(part.type === "schmitt-trigger" ? "182" : "183", P, Q, 0, 0.5, n(part, "lowerThreshold", 1.66), n(part, "upperThreshold", 3.33), n(part, "highLevel", 5), n(part, "lowLevel", 0)),
      ];
    case "tapped-transformer":
      return [line("169", P, Q, part.orientation.flip ? 1 : 0, n(part, "inductance", 4), n(part, "ratio", 1), 0, 0, 0, n(part, "coupling", 0.99))];
    case "npn-darlington":
    case "pnp-darlington": {
      const pnp = part.type === "pnp-darlington" ? -1 : 1;
      const t = `0_${pnp}_0_0_${n(part, "beta", 100)}`;
      return [line("400", P, toDoc(part, part.length ?? 3, 0), 0, t, t, pnp)];
    }
    case "ota": {
      const len = part.length ?? 7;
      const rails = [`0_0_40_${n(part, "negSupply", -9)}_0_0_0.5`, `0_0_40_${n(part, "posSupply", 9)}_0_0_0.5`];
      return [line("402", toDoc(part, 0, 2), toDoc(part, len, 2), 0, ...rails, ...OTA_PNP.map((p) => `0_${p}_0_0_100`))];
    }
    case "relay-coil":
      return [
        line("425", P, Q, 0, escapeFalstad(s(part, "link", "K1")), n(part, "coilInductance", 0.2), 0, n(part, "onCurrent", 0.02), n(part, "coilResistance", 20),
          n(part, "offCurrent", 0.015), n(part, "switchingTime", 0.005), Math.max(0, COIL_TYPES.indexOf(s(part, "coilType", "normal"))), 0, b(part, "initiallyOn") ? 1 : 0),
      ];
    case "relay-contact": {
      const nc = b(part, "normallyClosed");
      const closed = b(part, "initiallyEnergized") !== nc;
      const tok = [escapeFalstad(s(part, "link", "K1")), n(part, "onResistance", 0.05), n(part, "offResistance", 1e6), closed ? 0 : 1];
      return [(nc ? 2 : 0) | 4].map((f) => line("426", P, Q, f, ...tok));
    }
    case "three-phase-motor": {
      const len = part.length ?? 9;
      return [
        line("427", toDoc(part, 0, 2), toDoc(part, len, 2), 0, n(part, "statorResistance", 0.435), n(part, "rotorResistance", 0.816), n(part, "statorInductance", 0.0294),
          n(part, "rotorInductance", 0.0297), n(part, "mutualInductance", 0.0287), n(part, "friction", 0.05), n(part, "inertia", 1)),
      ];
    }
    case "vco":
      return [line("158", P, right(2), 0)];
    case "phase-comparator": {
      const hv = n(part, "supply", 5);
      return [hv === 5 ? line("161", P, right(2), 0) : line("161", P, right(2), 1 << 13, hv)];
    }
    default:
      return null;
  }
}
