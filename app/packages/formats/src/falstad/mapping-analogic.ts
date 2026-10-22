// Falstad mappings for the "analogic" parts: GyratorElm (XML tag Gyrator),
// TappedTransformerElm (169), DarlingtonElm (400), OTAElm (402), NortonAmpElm
// (XML tag nor), RelayCoilElm (425) + RelayContactElm (426), ThreePhaseMotorElm
// (427), VCOElm (158), PhaseCompElm (161), SchmittElm (182), InvertingSchmittElm
// (183). Token orders and post positions follow each class's StringTokenizer
// constructor and setPoints() under
// https://github.com/pfalstad/circuitjs1/tree/master/src/com/lushprojects/circuitjs1/client
// Falstad's interpPoint(p1, p2, f, g) offsets by g·(dy, -dx)/dn, which is our
// local -y for a part placed from p1 toward p2 (unmirrored).

import type { PartMapping } from "./mapping";
import { unescapeFalstad, type FalstadElement } from "./text";

type Rule = (el: FalstadElement, unit: number) => PartMapping | null;
type Pt = [number, number];

const num = (el: FalstadElement, i: number, fallback = 0): number => {
  const v = Number(el.params[i]);
  return el.params[i] === undefined || el.params[i] === "" || Number.isNaN(v) ? fallback : v;
};

/** CircuitElm.setPoints(): perpendicular offsets follow the drawing direction. */
function dsign(el: FalstadElement): number {
  const dy = el.y2 - el.y1;
  return dy === 0 ? Math.sign(el.x2 - el.x1) : Math.sign(dy);
}

/** Unit vector along the element and Falstad's offset direction (dy, -dx)/dn (our local -y). */
function axes(el: FalstadElement): { u: Pt; g: Pt; dn: number } {
  const dx = el.x2 - el.x1;
  const dy = el.y2 - el.y1;
  const dn = Math.hypot(dx, dy) || 1;
  return { u: [dx / dn, dy / dn], g: [dy / dn, -dx / dn], dn };
}

const add = (p: Pt, v: Pt, k: number): Pt => [p[0] + v[0] * k, p[1] + v[1] * k];
const axial = (el: FalstadElement) => el.x1 === el.x2 || el.y1 === el.y2;

/** Chip pin spacing (ChipElm.setSize: cspc2 = 16·size, size 1 with FLAG_SMALL = 1). */
const chipSpacing = (el: FalstadElement) => (el.flags & 1 ? 16 : 32);
const CHIP_FLIP_FLAGS = (1 << 10) | (1 << 11) | (1 << 12);

/** One token of a CompositeElm child dump ("flags_param_param..."), as a number. */
const sub = (el: FalstadElement, i: number, k: number, fallback: number): number => {
  const v = Number((el.params[i] ?? "").split("_")[k]);
  return Number.isFinite(v) ? v : fallback;
};

/** Net name that links a relay coil to its contacts. */
export const relayLinkNet = (label: string) => `${label}.arm`;

/** Our "arm" terminal sits at local (2 + ⌊(L - 4)/2⌋, side) on coils and contacts (midTerminals). */
function armPoint(el: FalstadElement, unit: number, side: number): Pt {
  const { u, g, dn } = axes(el);
  const L = Math.round(dn / unit);
  const ax = 2 + Math.floor((L - 4) / 2);
  return add(add([el.x1, el.y1], u, ax * unit), g, -side * unit);
}

function chip(type: string, props: (el: FalstadElement) => Record<string, string | number | boolean>): Rule {
  return (el, unit) => {
    if (el.flags & CHIP_FLIP_FLAGS) return null;
    const c = chipSpacing(el);
    if (c !== 2 * unit) return null;
    return { type, props: props(el), posts: 4, place: { at: [el.x1, el.y1], toward: [el.x1 + c, el.y1], flip: false } };
  };
}

function schmitt(type: string): Rule {
  // InvertingSchmittElm: slewRate lowerTrigger upperTrigger logicOnLevel logicOffLevel.
  return (el) => ({
    type,
    props: {
      lowerThreshold: num(el, 1, 1.66),
      upperThreshold: num(el, 2, 3.33),
      highLevel: num(el, 3, 5),
      lowLevel: num(el, 4, 0),
    },
    posts: 2,
  });
}

export const ANALOGIC_LABELS: Record<string, string> = {
  gyrator: "G",
  "tapped-transformer": "T",
  "npn-darlington": "Q",
  "pnp-darlington": "Q",
  ota: "U",
  "norton-amp": "U",
  "relay-coil": "K",
  "relay-contact": "K",
  "three-phase-motor": "M",
  vco: "U",
  "phase-comparator": "U",
  "schmitt-trigger": "U",
  "inverting-schmitt-trigger": "U",
};

export const ANALOGIC_FALSTAD_PARTS: Record<string, Rule> = {
  // GyratorElm (XML only, no attributes: R = 1000). Port 2's posts are offset -dsign·width·flip
  // (width 32 on load) from point1/point2; point2 is forced onto the axis (FLAG_VERTICAL = 8).
  Gyrator: (el, unit) => {
    if (unit !== 16) return null;
    const flip = el.flags & 16 ? -1 : 1;
    const toward: Pt = el.flags & 8 ? [el.x1, el.y2] : [el.x2, el.y1];
    if (toward[0] === el.x1 && toward[1] === el.y1) return null;
    return { type: "gyrator", props: { resistance: 1000 }, posts: 4, place: { at: [el.x1, el.y1], toward, flip: dsign(el) * flip < 0 } };
  },

  // TappedTransformerElm: inductance ratio current0 current1 [current2 [coupling]]. Primary from
  // point1 to the post 64 px across (-2·hs offset, hs = 32·flip, FLAG_FLIP = 1); secondary from
  // point2 through the tap (32 px) to the post 64 px across.
  "169": (el, unit) =>
    unit !== 16 || !axial(el)
      ? null
      : {
          type: "tapped-transformer",
          props: { inductance: num(el, 0, 4), ratio: num(el, 1, 1), coupling: num(el, 5, 0.99) },
          posts: 4,
          place: { at: [el.x1, el.y1], toward: [el.x2, el.y2], flip: (el.flags & 1) !== 0 },
          sliderProps: { 0: "inductance", 2: "coupling" },
        },

  // DarlingtonElm (CompositeElm): two TransistorElm dumps "flags_pnp_vbe_vbc_beta", then pnp.
  // Base at point1, collector 16·dsign·pnp px across at point2 (as TransistorElm).
  "400": (el, unit) => {
    if (unit !== 16) return null;
    const pnp = num(el, 2, 1) === -1;
    return {
      type: pnp ? "pnp-darlington" : "npn-darlington",
      props: { beta: sub(el, 0, 4, 100) },
      posts: 3,
      place: { at: [el.x1, el.y1], toward: [el.x2, el.y2], flip: dsign(el) < 0 },
    };
  },

  // OTAElm (CompositeElm): 2 RailElm dumps (negative, positive supply as maxVoltage), then the
  // transistors. Posts: + at point1 offset 32·dsign, - opposite, D at point1, Iabc 16 px before
  // point2 offset 32 (not dsign-scaled), out at point2; only drawn left to right (dsign > 0).
  "402": (el, unit) => {
    const { u, g, dn } = axes(el);
    if (unit !== 16 || !axial(el) || dsign(el) <= 0 || dn <= 94) return null;
    const at = add([el.x1, el.y1], g, 32);
    return {
      type: "ota",
      props: { negSupply: sub(el, 0, 3, -9), posSupply: sub(el, 1, 3, 9) },
      posts: 4,
      place: { at, toward: add(at, u, dn), flip: false },
    };
  },

  // NortonAmpElm (XML tag "nor", no attributes): in+ at point1 offset opheight·dsign (FLAG_SWAP = 1
  // negates it, FLAG_SMALL = 2 halves opheight), in- opposite, output at point2 — OpAmpElm's layout.
  nor: (el, unit) => {
    const opheight = el.flags & 2 ? 8 : 16;
    if (opheight !== unit || !axial(el)) return null;
    const hs = opheight * dsign(el) * (el.flags & 1 ? -1 : 1);
    const { g } = axes(el);
    const first = add([el.x1, el.y1], g, hs);
    return {
      type: "norton-amp",
      props: {},
      posts: 3,
      place: { at: first, toward: [first[0] + el.x2 - el.x1, first[1] + el.y2 - el.y1], flip: hs < 0 },
    };
  },

  // RelayCoilElm: label inductance coilCurrent onCurrent coilR offCurrent switchingTime type state
  // switchPosition. Posts point1, point2; our "arm" terminal gets a net label named after the label.
  "425": (el, unit) => {
    if (!axial(el)) return null;
    const label = unescapeFalstad(el.params[0] ?? "K1");
    const types = ["normal", "on-delay", "off-delay", "latching", "latching-set", "latching-reset"];
    return {
      type: "relay-coil",
      props: {
        link: label,
        coilInductance: num(el, 1, 0.2),
        onCurrent: num(el, 3, 0.02),
        coilResistance: num(el, 4, 20),
        offCurrent: num(el, 5, 0.015),
        switchingTime: num(el, 6, 0.005),
        coilType: types[num(el, 7, 0)] ?? "normal",
        initiallyOn: num(el, 9, 0) === 1,
      },
      posts: 3,
      netLabels: [{ name: relayLinkNet(label), at: armPoint(el, unit, 1) }],
    };
  },

  // RelayContactElm: label r_on r_off [i_position]; FLAG_NORMALLY_CLOSED = 2. The blade swings to
  // openhs = 16·dsign (local -dsign); mirrored when dsign < 0 so our "arm" sits on the other side.
  "426": (el, unit) => {
    if (!axial(el)) return null;
    const label = unescapeFalstad(el.params[0] ?? "K1");
    const nc = (el.flags & 2) !== 0;
    const flip = dsign(el) < 0;
    return {
      type: "relay-contact",
      props: {
        link: label,
        normallyClosed: nc,
        onResistance: num(el, 1, 0.05),
        offResistance: num(el, 2, 1e6),
        initiallyEnergized: (num(el, 3, 0) === 0) !== nc,
      },
      posts: 3,
      place: { at: [el.x1, el.y1], toward: [el.x2, el.y2], flip },
      netLabels: [{ name: relayLinkNet(label), at: armPoint(el, unit, flip ? -1 : 1) }],
    };
  },

  // ThreePhaseMotorElm: Rs Rr Ls Lr Lm b [J]. Posts U1, V1, W1 at point1 offset -q·32·(i-1),
  // U2, V2, W2 at point2 offset +q·32·(i-1), q = -1 when drawn vertically.
  "427": (el, unit) => {
    if (unit !== 16 || !axial(el)) return null;
    const dx = el.x2 - el.x1;
    const dy = el.y2 - el.y1;
    const q = Math.abs(dy) > Math.abs(dx) ? -1 : 1;
    const { g } = axes(el);
    const at = add([el.x1, el.y1], g, 32 * q);
    return {
      type: "three-phase-motor",
      props: {
        statorResistance: num(el, 0, 0.435),
        rotorResistance: num(el, 1, 0.816),
        statorInductance: num(el, 2, 0.0294),
        rotorInductance: num(el, 3, 0.0297),
        mutualInductance: num(el, 4, 0.0287),
        friction: num(el, 5, 0.05),
        inertia: num(el, 6, 1),
      },
      posts: 4,
      place: { at, toward: [at[0] + dx, at[1] + dy], flip: q < 0 },
    };
  },

  // VCOElm (ChipElm 2×4): Vi W0, Vo W3, C E0, C E1, R1 E2, R2 E3.
  "158": chip("vco", () => ({})),
  // PhaseCompElm (ChipElm 2×2): I1 W0, I2 W1, O E0; [highVoltage] with FLAG_CUSTOM_VOLTAGE.
  "161": chip("phase-comparator", (el) => ({ supply: el.flags & (1 << 13) ? num(el, 0, 5) : 5 })),

  "182": schmitt("schmitt-trigger"),
  "183": schmitt("inverting-schmitt-trigger"),
};
