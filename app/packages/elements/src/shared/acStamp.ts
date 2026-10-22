// Helpers for the small-signal stampAC hook (api.ts ComplexStamper).
import type { ComplexStamper, Stamper, StepInfo } from "../api";
import { cos, sin } from "@cs/dmath";
import { num, type Props } from "./props";

/** StepInfo used when an AC stamp reuses a model's real "ac"-kind stamps. */
export const AC_STEP: StepInfo = { kind: "ac", t: 0, dt: 0, method: "be", gmin: 1e-12, sourceScale: 1, omega: 0 };

/**
 * A real Stamper that writes into the real part of a ComplexStamper. With
 * keepRhs false (the default) right-hand-side writes are dropped, which is
 * what a small-signal stamp wants from DC/Newton stamps (bias terms vanish).
 */
export function realPart(s: ComplexStamper, keepRhs = false): Stamper {
  return {
    matrix: (r, c, v) => s.matrix(r, c, v, 0),
    rhs: (r, v) => {
      if (keepRhs) s.rhs(r, v, 0);
    },
    conductance: (a, b, g) => s.admittance(a, b, g, 0),
    current: (a, b, i) => {
      if (keepRhs) s.current(a, b, i, 0);
    },
    voltageSource: (br, p, m, v) => s.voltageSource(br, p, m, keepRhs ? v : 0, 0),
  };
}

/** AC stimulus of an independent source from its acMagnitude / acPhase (degrees) props. */
export interface AcStimulus {
  re: number;
  im: number;
}

export function acStimulus(p: Props): AcStimulus {
  const mag = num(p, "acMagnitude", 0);
  const ph = (num(p, "acPhase", 0) * Math.PI) / 180;
  return { re: mag * cos(ph), im: mag * sin(ph) };
}
