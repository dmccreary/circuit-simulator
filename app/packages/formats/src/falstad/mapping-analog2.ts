// Falstad mappings for the analog parts of agent "analog2": tunnel diode, varactor,
// polarized capacitor, spark gap, crystal, SCR, triac, diac, triode, unijunction
// transistor and antenna. Argument orders and post positions come from each
// element's StringTokenizer constructor and setPoints()/getPost() in CircuitJS1,
// under https://github.com/pfalstad/circuitjs1/tree/master/src/com/lushprojects/circuitjs1/client
// (TunnelDiodeElm, VaractorElm, DiodeElm, PolarCapacitorElm, CapacitorElm, SparkGapElm,
// CrystalElm, CompositeElm, SCRElm, TriacElm, DiacElm, TriodeElm, UnijunctionElm, AntennaElm).
// Parameters are the tokens after "type x1 y1 x2 y2 flags".

import type { PropValue } from "@cs/model";
import type { PartMapping } from "./mapping";
import { unescapeFalstad, type FalstadElement } from "./text";

type Rule = (el: FalstadElement, unit: number) => PartMapping | null;
type Pt = [number, number];

const num = (el: FalstadElement, i: number, fallback = 0): number => {
  const v = Number(el.params[i]);
  return el.params[i] === undefined || el.params[i] === "" || Number.isNaN(v) ? fallback : v;
};

const sign = (v: number): number => (v < 0 ? -1 : v > 0 ? 1 : 0);

/** CircuitElm.dsign: the side perpendicular offsets fall on follows the drawing direction. */
const dsign = (el: FalstadElement): number => (el.y2 === el.y1 ? sign(el.x2 - el.x1) : sign(el.y2 - el.y1));

/** CircuitElm.interpPoint(a, b, f, g): f along a->b, g across it (to the right of a->b on screen), rounded like Java. */
function interp(a: Pt, b: Pt, f: number, g = 0): Pt {
  const gx = b[1] - a[1];
  const gy = a[0] - b[0];
  const n = Math.hypot(gx, gy) || 1;
  return [Math.floor(a[0] * (1 - f) + b[0] * f + (g * gx) / n + 0.48), Math.floor(a[1] * (1 - f) + b[1] * f + (g * gy) / n + 0.48)];
}

/**
 * Our terminals in Falstad pixels, placed as the mapper places a part with
 * `place` (terminal 0 at `at`, rotation and length from the major axis toward
 * `toward`, y mirrored with `flip`). `local(L)` lists the terminals in grid
 * units for part length L, as the part's descriptor does (formats cannot
 * import @cs/elements).
 */
function ourPosts(place: NonNullable<PartMapping["place"]>, unit: number, local: (L: number) => Pt[]): Pt[] {
  const g = (v: number) => Math.round(v / unit);
  const from: Pt = [g(place.at[0]), g(place.at[1])];
  const dx = g(place.toward[0]) - from[0];
  const dy = g(place.toward[1]) - from[1];
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const L = horizontal ? Math.abs(dx) : Math.abs(dy);
  const rot = horizontal ? (dx >= 0 ? 0 : 180) : dy > 0 ? 90 : 270;
  return local(L).map(([x, y0]) => {
    const y = place.flip ? -y0 : y0;
    const [rx, ry] = rot === 90 ? [-y, x] : rot === 180 ? [-x, -y] : rot === 270 ? [y, -x] : [x, y];
    return [(from[0] + rx) * unit, (from[1] + ry) * unit];
  });
}

/** Wires from our terminal positions to Falstad's posts wherever they land on different grid points. */
function joinPosts(ours: Pt[], theirs: Pt[], unit: number): Pt[][] {
  const g = (p: Pt) => `${Math.round(p[0] / unit)},${Math.round(p[1] / unit)}`;
  return ours.flatMap((p, k) => (g(p) === g(theirs[k]) ? [] : [[p, theirs[k]]]));
}

/** Multi-terminal mapping: placement plus any wires needed to reach Falstad's posts. */
function placed(
  base: Omit<PartMapping, "place" | "wires" | "posts">,
  unit: number,
  place: NonNullable<PartMapping["place"]>,
  local: (L: number) => Pt[],
  theirs: Pt[],
): PartMapping {
  return { ...base, posts: 3, place, wires: joinPosts(ourPosts(place, unit, local), theirs, unit) };
}

const DEFAULT_FWDROP = 0.805904783;

/**
 * SCRElm / TriacElm setPoints(): point2 is pulled onto the major axis, and the
 * gate sits 2 grid squares across it, `gatelen` past lead2, on the side `dir`
 * picks from the (slightly diagonal) original point2. SCRElm without
 * FLAG_GATE_FIX keeps the diagonal length; SCRElm snaps the gate to the grid.
 */
function thyristorPosts(el: FalstadElement, grid: number, gateFix: boolean, snap: boolean) {
  const dx = el.x2 - el.x1;
  const dy = el.y2 - el.y1;
  let dn = Math.hypot(dx, dy);
  let dir: number;
  let p2: Pt;
  if (Math.abs(dx) > Math.abs(dy)) {
    dir = -sign(dx) * sign(dy);
    if (gateFix) dn = Math.abs(dx);
    p2 = [el.x2, el.y1];
  } else {
    dir = sign(dy) * sign(dx);
    if (gateFix) dn = Math.abs(dy);
    p2 = [el.x1, el.y2];
  }
  if (dir === 0) dir = 1;
  const p1: Pt = [el.x1, el.y1];
  if (dn === 0) return null;
  const lead2 = interp(p1, p2, (dn + 16) / (2 * dn));
  const leadlen = (dn - 16) / 2;
  const gatelen = grid + (leadlen % grid);
  if (leadlen < gatelen) return null; // CircuitJS1 collapses the element
  let gate = interp(lead2, p2, gatelen / leadlen, grid * 2 * dir);
  if (snap) gate = gate.map((v) => (v + grid / 2 - 1) & ~(grid - 1)) as Pt;
  return { p1, p2, gate, dir };
}

/** Thyristor terminals: the axis, and the gate at (floor(L/2) + 2, 2) (THYRISTOR_LENGTH 6 with the gate a mid terminal). */
const thyristorLocal = (L: number): Pt[] => [[0, 0], [L, 0], [Math.floor(L / 2) + 2, 2]];

/** CompositeElm sub-element dumps: "flags v1 v2 ...", escaped with FLAG_ESCAPE = 1, else "_"-separated. */
function subDump(el: FalstadElement, i: number): number[] {
  const raw = el.params[i] ?? "";
  const text = el.flags & 1 ? unescapeFalstad(raw) : raw.replace(/_/g, " ");
  return text.trim().split(/\s+/).map(Number);
}

export const ANALOG2_LABELS: Record<string, string> = {
  "tunnel-diode": "D",
  varactor: "D",
  "polar-capacitor": "C",
  "spark-gap": "SG",
  crystal: "Y",
  scr: "D",
  triac: "D",
  diac: "D",
  triode: "V",
  unijunction: "Q",
  antenna: "ANT",
};

export const ANALOG2_FALSTAD_PARTS: Record<string, Rule> = {
  // TunnelDiodeElm: no tokens.
  "175": () => ({ type: "tunnel-diode", props: {}, posts: 2 }),

  // VaractorElm: the DiodeElm tokens ([fwdrop] with FLAG_FWDROP = 1, [modelName] with FLAG_MODEL = 2),
  // then capvoltdiff baseCapacitance. A named diode model is read as the default forward drop.
  "176": (el) => {
    const skip = el.flags & 3 ? 1 : 0;
    const fwdrop = el.flags & 1 ? num(el, 0, DEFAULT_FWDROP) : DEFAULT_FWDROP;
    const vc = num(el, skip, 0);
    const named = (el.flags & 2) !== 0 && el.params[0] !== "default";
    return {
      type: "varactor",
      props: { baseCapacitance: num(el, skip + 1, 4e-12), forwardVoltage: fwdrop },
      savedState: [vc, 0, 0, vc],
      posts: 2,
      sliderProps: { 1: "baseCapacitance" },
      ...(named ? { approximate: true } : {}),
    };
  },

  // PolarCapacitorElm: the CapacitorElm tokens (capacitance voltdiff [initialVoltage
  // [seriesResistance with FLAG_RESISTANCE = 4]]), then maxNegativeVoltage. Point1 is "+".
  "209": (el) => {
    const hasR = (el.flags & 4) !== 0;
    return {
      type: "polar-capacitor",
      props: {
        capacitance: num(el, 0, 1e-5),
        initialVoltage: num(el, 2, 1e-3),
        seriesResistance: hasR ? num(el, 3, 0) : 0,
        maxReverseVoltage: num(el, hasR ? 4 : 3, 1),
      },
      savedState: [num(el, 1, 0), 0, 0],
      posts: 2,
      sliderProps: { 0: "capacitance" },
    };
  },

  // SparkGapElm: onresistance offresistance breakdown holdcurrent.
  "187": (el) => ({
    type: "spark-gap",
    props: {
      onResistance: num(el, 0, 1e3),
      offResistance: num(el, 1, 1e9),
      breakdownVoltage: num(el, 2, 1e3),
      holdingCurrent: num(el, 3, 0.001),
    },
    posts: 2,
  }),

  // CrystalElm (CompositeElm "CapacitorElm 1 2, CapacitorElm 1 3, InductorElm 3 4, ResistorElm 4 2"):
  // one dump per sub-element: Cp (flags c vd ...), Cs (flags c vd ...), L (flags l i ...), R (flags r).
  "412": (el) => {
    const cp = subDump(el, 0);
    const cs = subDump(el, 1);
    const ind = subDump(el, 2);
    const res = subDump(el, 3);
    const v = (a: number[], i: number, fallback: number) => (Number.isFinite(a[i]) ? a[i] : fallback);
    const sc = v(cs, 1, 0.1e-12);
    const l = v(ind, 1, 2.5e-3);
    const props: Record<string, PropValue> = {
      frequency: 1 / (2 * Math.PI * Math.sqrt(l * sc)),
      seriesCapacitance: sc,
      parallelCapacitance: v(cp, 1, 28.7e-12),
      resistance: v(res, 1, 6.4),
    };
    // State: holder v, i, i'; arm i, vs, vL, vL' (crystal model layout).
    return { type: "crystal", props, savedState: [v(cp, 2, 0), 0, 0, v(ind, 2, 0), v(cs, 2, 0), 0, 0], posts: 2 };
  },

  // DiacElm: onresistance offresistance breakdown holdcurrent.
  "203": (el) => ({
    type: "diac",
    props: {
      onResistance: num(el, 0, 500),
      offResistance: num(el, 1, 1e8),
      breakdownVoltage: num(el, 2, 30),
      holdingCurrent: num(el, 3, 0.01),
    },
    posts: 2,
  }),

  // SCRElm: lastvac lastvag [triggerI holdingI gresistance]; FLAG_GATE_FIX = 1.
  // Posts: anode point1, cathode point2 (put on the axis), gate as thyristorPosts().
  "177": (el, unit) => {
    const p = thyristorPosts(el, unit, (el.flags & 1) !== 0, true);
    if (!p) return null;
    const props = { triggerCurrent: num(el, 2, 0.01), holdingCurrent: num(el, 3, 0.0082), gateResistance: num(el, 4, 50) };
    // The gate is `2·grid·dir` along interpPoint's perpendicular, which is our local -y.
    return placed({ type: "scr", props }, unit, { at: p.p1, toward: p.p2, flip: p.dir > 0 }, thyristorLocal, [p.p1, p.p2, p.gate]);
  },

  // TriacElm: triggerI holdingI cresistance state. Posts: MT2 point1, MT1 point2 (on the axis), gate.
  "206": (el, unit) => {
    const p = thyristorPosts(el, unit, true, false);
    if (!p) return null;
    const props = {
      triggerCurrent: num(el, 0, 0.01),
      holdingCurrent: num(el, 1, 0.0082),
      gateResistance: num(el, 2, 100),
      on: el.params[3] === "true",
    };
    return placed({ type: "triac", props }, unit, { at: p.p1, toward: p.p2, flip: p.dir > 0 }, thyristorLocal, [p.p1, p.p2, p.gate]);
  },

  // TriodeElm: mu kg1. Grid at point1; plate 32 px across from point2 and the cathode 16 px back
  // and 32 px the other way (setPoints), the side s flipped by FLAG_FLIP = 1 and, with
  // FLAG_DSIGN_FIX = 2, by the drawing direction. Ours: G (0,0), P (L,-2), K (L-1,2).
  "173": (el, unit) => {
    let s = el.flags & 2 ? dsign(el) : 1;
    if (el.flags & 1) s = -s;
    const p1: Pt = [el.x1, el.y1];
    const p2: Pt = [el.x2, el.y2];
    const plate = interp(p1, p2, 1, 32 * s);
    const plate1 = interp(p1, p2, 1, 8 * s);
    const cath = interp(p2, plate1, -4, 16 * s);
    return placed(
      { type: "triode", props: { mu: num(el, 0, 93), kg1: num(el, 1, 680) }, sliderProps: { 0: "mu", 1: "kg1" } },
      unit,
      { at: p1, toward: p2, flip: s < 0 },
      (L) => [[0, 0], [L, -2], [L - 1, 2]],
      [p1, plate, cath],
    );
  },

  // UnijunctionElm: no tokens (the composite's state is not dumped). Emitter at point1, B2 at
  // point2, B1 32 px across from point2 on the side hs2 = 16·dsign (negated by FLAG_FLIP = 2).
  // Ours: E (0,0), B1 (L,2), B2 (L,0).
  "417": (el, unit) => {
    const hs2 = 16 * dsign(el) * (el.flags & 2 ? -1 : 1);
    const p1: Pt = [el.x1, el.y1];
    const p2: Pt = [el.x2, el.y2];
    const q1 = interp(p1, p2, 0, -hs2);
    const q2 = interp(p1, p2, 1, -hs2);
    return placed(
      // The model omits the composite's 35 pF internal capacitor (see unijunction/model.ts).
      { type: "unijunction", props: {}, approximate: true },
      unit,
      { at: p1, toward: p2, flip: hs2 < 0 },
      (L) => [[0, 0], [L, 2], [L, 0]],
      [interp(q1, q2, 0, hs2), interp(q1, q2, 1, -hs2), interp(q1, q2, 1, hs2)],
    );
  },

  // AntennaElm: the RailElm tokens (ignored: the waveform is fixed). One post at point1.
  A: () => ({ type: "antenna", props: {}, posts: 1, stretch: true }),
};
