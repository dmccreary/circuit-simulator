// Falstad mappings for rails, readouts, logic parts, and the other parts added
// for library compatibility. Argument orders come from each element's
// StringTokenizer constructor in CircuitJS1, under
// https://github.com/pfalstad/circuitjs1/tree/master/src/com/lushprojects/circuitjs1/client
// (RailElm, VarRailElm, VoltageElm, SweepElm, OutputElm, AudioOutputElm,
// Switch2Elm, LogicInputElm, LogicOutputElm, InverterElm, GateElm, ChipElm,
// DFlipFlopElm, JKFlipFlopElm). Parameters are the tokens after "type x1 y1 x2 y2 flags".

import type { PropValue } from "@cs/model";
import type { PartMapping } from "./mapping";
import { unescapeFalstad, type FalstadElement } from "./text";

type Rule = (el: FalstadElement, unit: number) => PartMapping | null;

const num = (el: FalstadElement, i: number, fallback = 0): number => {
  const v = Number(el.params[i]);
  return el.params[i] === undefined || el.params[i] === "" || Number.isNaN(v) ? fallback : v;
};

const RAD_TO_DEG = 180 / Math.PI;

// VoltageElm waveforms -> rail waveform (7 is VarRailElm's slider).
const RAIL_WAVES: Record<number, string> = { 0: "dc", 1: "ac", 2: "square", 3: "triangle", 4: "sawtooth", 5: "pulse", 6: "noise" };
const WF_VAR = 7;
const FLAG_COS = 2;

/** RailElm / VarRailElm: the VoltageElm tokens (waveform frequency maxVoltage bias phaseShift dutyCycle). */
function rail(el: FalstadElement, variable = false): PartMapping | null {
  const wf = num(el, 0, 0);
  const frequency = num(el, 1, 40);
  const maxV = num(el, 2, 5);
  const bias = num(el, 3, 0);
  const base = { type: "rail", posts: 1 as const, stretch: true };
  if (variable || wf === WF_VAR) {
    // VarRailElm (always WF_VAR once loaded, though older files write 6) keeps its current value in the frequency slot; the slider runs bias..maxVoltage.
    return {
      ...base,
      props: { waveform: "dc", voltage: frequency, offset: 0 },
      slider: { prop: "voltage", min: Math.min(bias, maxV), max: Math.max(bias, maxV) },
    };
  }
  const waveform = RAIL_WAVES[wf];
  if (!waveform) return null;
  const props: Record<string, PropValue> = { waveform, voltage: maxV, offset: bias };
  if (waveform !== "dc") {
    props.frequency = frequency;
    props.phase = (el.flags & FLAG_COS ? Math.PI / 2 : num(el, 4, 0)) * RAD_TO_DEG;
    props.dutyCycle = num(el, 5, 0.5) * 100;
  }
  return { ...base, props, sliderProps: waveform === "dc" ? { 0: "voltage" } : { 0: "voltage", 2: "offset" } };
}

/** Chip pin spacing (ChipElm.setSize: cspc2 = 16·size, size 1 with FLAG_SMALL = 1). */
const chipSpacing = (el: FalstadElement) => (el.flags & 1 ? 16 : 32);
const CHIP_FLIP_FLAGS = (1 << 10) | (1 << 11) | (1 << 12); // FLAG_FLIP_X, _Y, _XY

/** Falstad's first gate input sits farthest along its perpendicular; ours is on the other side, so mirror. */
function gate(type: string): Rule {
  return (el, unit) => {
    const n = num(el, 0, 2);
    if (n < 2 || n > 4) return null;
    if (el.flags & ((1 << 2) | (1 << 3))) return null; // FLAG_INVERT_INPUTS, FLAG_DEMORGAN
    const hs = el.flags & 1 ? 8 : 16; // gheight, FLAG_SMALL
    if (hs !== unit) return null; // inputs must land one grid unit apart
    const i0 = -Math.floor(n / 2);
    const dx = el.x2 - el.x1;
    const dy = el.y2 - el.y1;
    const dn = Math.hypot(dx, dy) || 1;
    // interpPoint(point1, point2, 0, g) offsets by g·(dy, -dx)/dn.
    const at: [number, number] = [el.x1 + (hs * i0 * dy) / dn, el.y1 - (hs * i0 * dx) / dn];
    const props: Record<string, PropValue> = { supply: num(el, 2, 5) };
    if (el.flags & 2) props.schmitt = true; // FLAG_SCHMITT
    return {
      type: n === 2 ? type : `${type}-${n}`,
      props,
      posts: 3,
      place: { at, toward: [at[0] + dx, at[1] + dy], flip: true },
    };
  };
}

/** CircuitElm.setPoints(): perpendicular offsets follow the drawing direction. */
function dsign(el: FalstadElement): number {
  const dy = el.y2 - el.y1;
  const dx = el.x2 - el.x1;
  return dy === 0 ? Math.sign(dx) : Math.sign(dy);
}

function analogSwitch(type: string): Rule {
  return (el, unit) => {
    if (unit !== 16) return null;
    // openhs is -16 when exactly one of FLAG_FLIPPED_X (4), _Y (8), FLAG_FLIPPED (16) flips it.
    const flips = [4, 8, 16].filter((f) => el.flags & f).length;
    return {
      type,
      props: {
        onResistance: num(el, 0, 20),
        offResistance: num(el, 1, 1e10),
        threshold: num(el, 2, 2.5),
        invert: (el.flags & 1) !== 0,
        pulldown: (el.flags & 2) !== 0,
      },
      posts: 3,
      place: { at: [el.x1, el.y1], toward: [el.x2, el.y2], flip: flips % 2 === 1 },
    };
  };
}

function exprSource(kind: string): Rule {
  return (el, unit) => {
    if (el.flags & CHIP_FLIP_FLAGS) return null;
    const c = chipSpacing(el);
    if (c !== 2 * unit) return null;
    const k = el.flags & (1 << 13) ? 1 : 0;
    const inputs = num(el, k, 2);
    if (inputs < 0 || inputs > 8) return null;
    return {
      type: "expression-source",
      props: { kind, inputs, expression: unescapeFalstad(el.params[k + 1] ?? "0") },
      posts: 4,
      place: { at: [el.x1, el.y1], toward: [el.x1 + c, el.y1], flip: false },
    };
  };
}

export const MORE_FALSTAD_PARTS: Record<string, Rule> = {
  R: (el) => rail(el),
  // NoiseElm in old files: a rail with the VoltageElm tokens and the noise waveform.
  n: (el) => {
    const m = rail(el);
    return m && { ...m, props: { ...m.props, waveform: "noise", frequency: num(el, 1, 40) }, approximate: true };
  },
  "172": (el) => rail(el, true),

  // SweepElm: minF maxF maxV sweepTime; FLAG_LOG = 1, FLAG_BIDIR = 2 (approximated by restarting).
  "170": (el) => ({
    type: "rail",
    props: {
      waveform: "sweep",
      frequency: num(el, 0, 20),
      maxFrequency: num(el, 1, 4000),
      voltage: num(el, 2, 5),
      sweepTime: num(el, 3, 0.1),
      logSweep: (el.flags & 1) !== 0,
    },
    posts: 1,
    stretch: true,
    approximate: (el.flags & 2) !== 0,
  }),

  // OutputElm: [scale]. AudioOutputElm: duration samplingRate labelNum (only the voltage is shown).
  O: () => ({ type: "voltage-readout", props: {}, posts: 1, stretch: true }),
  "211": () => ({ type: "voltage-readout", props: {}, posts: 1, stretch: true, approximate: true }),

  // Switch2Elm: position momentary link [throwCount]; FLAG_CENTER_OFF = 1.
  // Throw 0 sits on the -perpendicular side of point2, which is our "A" (local y = -1).
  S: (el) => {
    if (num(el, 3, 2) !== 2 || el.flags & 1) return null;
    const p = el.params[0];
    const position = p === "true" ? 1 : p === "false" ? 0 : num(el, 0, 0);
    return {
      type: "spdt-switch",
      props: { thrown: position === 1, momentary: el.params[1] === "true" },
      posts: 3,
      place: { at: [el.x1, el.y1], toward: [el.x2, el.y2], flip: false },
    };
  },

  // LogicInputElm: the SwitchElm tokens (position momentary [label with FLAG_LABEL = 4]) then hiV loV.
  // Position 0 is low ("true" reads as 0). Our symbol sits behind the terminal, so point it at point2.
  L: (el) => {
    const p = el.params[0];
    const position = p === "true" ? 0 : p === "false" ? 1 : num(el, 0, 0);
    const k = el.flags & 4 ? 3 : 2;
    return {
      type: "logic-input",
      props: { high: position !== 0, supply: num(el, k, 5) },
      posts: 1,
      place: { at: [el.x1, el.y1], toward: [2 * el.x1 - el.x2, 2 * el.y1 - el.y2], flip: false },
    };
  },

  // LogicOutputElm: threshold. The indicator sits at point2.
  M: () => ({ type: "logic-output", props: {}, posts: 1 }),

  // InverterElm: slewRate highVoltage. Input at point1, output at point2.
  I: (el) => ({ type: "not-gate", props: { supply: num(el, 1, 5) }, posts: 2 }),

  // GateElm: inputCount lastOutputVoltage [highVoltage].
  "150": gate("and-gate"),
  "151": gate("nand-gate"),
  "152": gate("or-gate"),
  "153": gate("nor-gate"),
  "154": (el, unit) => (num(el, 0, 2) === 2 ? gate("xor-gate")(el, unit) : null),

  // DFlipFlopElm (ChipElm): pins D (W0), Q (E0), Q̄ (E2), clock (W1); FLAG_RESET = 2 adds R at W2,
  // FLAG_SET = 4 moves pins, FLAG_INVERT_SET_RESET = 8. Falstad's chip is 3 spacings wide with Q̄
  // two spacings down; ours has Q̄ one spacing down, so a wire joins the two positions.
  "155": (el, unit) => {
    if (el.flags & (4 | 8 | CHIP_FLIP_FLAGS)) return null;
    const c = chipSpacing(el);
    if (c !== 2 * unit) return null; // a small chip on a 16-pixel grid: pins one unit apart
    const { x1: x, y1: y } = el;
    const wires: [number, number][][] = [[[x + 3 * c, y + c], [x + 3 * c, y + 2 * c]]];
    if (el.flags & 2) wires.push([[x, y + 2 * c], [x + c, y + 2 * c]]); // R: W2 -> our R below the box
    return { type: "d-flip-flop", props: {}, posts: 4, place: { at: [x, y], toward: [x + 3 * c, y], flip: false }, wires };
  },

  // JKFlipFlopElm (ChipElm): J (W0), clock (W1), K (W2), Q (E0), Q̄ (E2) — the same order and places as ours.
  // Falstad triggers on the falling edge unless FLAG_POSITIVE_EDGE = 4; ours on the rising edge.
  "156": (el, unit) => {
    if (el.flags & (2 | 8 | CHIP_FLIP_FLAGS)) return null;
    const c = chipSpacing(el);
    if (c !== 2 * unit) return null;
    return {
      type: "jk-flip-flop",
      props: {},
      posts: 4,
      place: { at: [el.x1, el.y1], toward: [el.x1 + 3 * c, el.y1], flip: false },
      approximate: (el.flags & 4) === 0,
    };
  },

  // TimerElm (ChipElm, 3×5): dis W1, tr W3, th W4, Vcc N1, ctl S1, out E2, rst E1, gnd S2.
  // Our terminal 0 (dis) is one spacing below point1. Only the 8-pin form (FLAG_GROUND = 4).
  "165": (el, unit) => {
    if (!(el.flags & 4) || el.flags & CHIP_FLIP_FLAGS) return null;
    const c = chipSpacing(el);
    if (c !== 2 * unit) return null;
    const at: [number, number] = [el.x1, el.y1 + c];
    return { type: "timer-555", props: {}, posts: 4, place: { at, toward: [at[0] + c, at[1]], flip: false } };
  },

  // RelayElm: poleCount inductance coilCurrent r_on r_off onCurrent coilR [offCurrent switchingTime position].
  // Only the coil-on-both-sides drawing (FLAG_BOTH_SIDES_COIL = 4, not FLAG_SWAP_COIL = 1);
  // FLAG_FLIP = 8 and the drawing direction mirror the poles, FLAG_PULLDOWN = 16 is ignored.
  "178": (el, unit) => {
    if (unit !== 16 || !(el.flags & 4) || el.flags & 1 || el.params.length < 7) return null;
    const poles = num(el, 0, 1);
    if (poles < 1 || poles > 4) return null;
    const onCurrent = num(el, 5, 0.02);
    const dflip = dsign(el) * (el.flags & 8 ? -1 : 1);
    return {
      type: poles === 1 ? "relay" : `relay-${poles}`,
      props: {
        coilInductance: num(el, 1, 0.2),
        onResistance: num(el, 3, 0.05),
        offResistance: num(el, 4, 1e6),
        onCurrent,
        coilResistance: num(el, 6, 20),
        offCurrent: num(el, 7, onCurrent),
        switchingTime: num(el, 8, 0),
      },
      posts: 4,
      place: { at: [el.x1, el.y1], toward: [el.x2, el.y2], flip: dflip < 0 },
    };
  },

  // AnalogSwitchElm: r_on r_off threshold; FLAG_INVERT = 1, FLAG_PULLDOWN = 2, and flip flags
  // 4/8/16 that move the control to the other side. AnalogSwitch2Elm takes the same tokens.
  "159": analogSwitch("analog-switch"),
  "160": analogSwitch("analog-switch-2"),

  // JfetElm: MosfetElm tokens (threshold beta), defaults -4 V and 0.00125. Imported as a
  // depletion MOSFET: the gate junction diode is left out.
  j: (el, unit) =>
    unit !== 16
      ? null
      : {
          type: el.flags & 1 ? "p-mosfet" : "n-mosfet",
          props: { threshold: num(el, 0, -4), beta: num(el, 1, 0.00125) },
          posts: 3,
          place: { at: [el.x1, el.y1], toward: [el.x2, el.y2], flip: dsign(el) * (el.flags & 8 ? -1 : 1) < 0 },
          approximate: true,
        },

  // MemristorElm: r_on r_off dopeWidth totalWidth mobility.
  m: (el) => ({
    type: "memristor",
    props: {
      onResistance: num(el, 0, 100),
      offResistance: num(el, 1, 16000),
      initialWidth: num(el, 2, 0),
      totalWidth: num(el, 3, 1e-8),
      mobility: num(el, 4, 1e-10),
    },
    posts: 2,
  }),

  // TransLineElm: delay impedance width [resistance]. Posts: point1 and point2 on the signal
  // conductor, the return conductor `width` px to the side (ds = dy == 0 ? sign(dx) : -sign(dy)).
  // Ours is 4 units wide; other widths get short wires to Falstad's return posts.
  "171": (el, unit) => {
    const dx = el.x2 - el.x1;
    const dy = el.y2 - el.y1;
    if (dx !== 0 && dy !== 0) return null;
    const ds = dy === 0 ? Math.sign(dx) : -Math.sign(dy);
    const width = num(el, 2, 64);
    const dn = Math.hypot(dx, dy) || 1;
    const side = (d: number): [number, number] => [(-dy / dn) * d * ds, (dx / dn) * d * ds];
    const wires: [number, number][][] = [];
    const ours = 4 * unit;
    if (width !== ours) {
      for (const [x, y] of [[el.x1, el.y1], [el.x2, el.y2]]) {
        const [fx, fy] = side(width);
        const [ox, oy] = side(ours);
        wires.push([[x + ox, y + oy], [x + fx, y + fy]]);
      }
    }
    return {
      type: "transmission-line",
      props: { delay: num(el, 0, 1e-8), impedance: num(el, 1, 75) },
      posts: 4,
      place: { at: [el.x1, el.y1], toward: [el.x2, el.y2], flip: ds < 0 },
      wires,
    };
  },

  // CC2Elm (ChipElm 2×3): X at W0, Y at W2, Z at E1; then gain (after highVoltage with FLAG_CUSTOM_VOLTAGE).
  "179": (el, unit) => {
    if (el.flags & CHIP_FLIP_FLAGS) return null;
    const c = chipSpacing(el);
    if (c !== 2 * unit) return null;
    return {
      type: "current-conveyor",
      props: { gain: num(el, el.flags & (1 << 13) ? 1 : 0, 1) },
      posts: 3,
      place: { at: [el.x1, el.y1], toward: [el.x1 + c, el.y1], flip: false },
    };
  },

  // VCVSElm / VCCSElm / CCVSElm / CCCSElm (ChipElm 2 wide): [highVoltage with FLAG_CUSTOM_VOLTAGE]
  // inputCount expression (escaped). Inputs on the left from point1, outputs E0 and E1.
  "212": exprSource("vcvs"),
  "213": exprSource("vccs"),
  "214": exprSource("ccvs"),
  "215": exprSource("cccs"),

  // SevenSegElm (ChipElm): baseSegmentCount extraSegment diodeDirection. Only the 7-segment,
  // logic-input form (direction 0): a-d at W0-W3, e-g at S1-S3 of a 4×4 chip.
  "157": (el, unit) => {
    const k = el.flags & (1 << 13) ? 1 : 0;
    if (el.flags & CHIP_FLIP_FLAGS || num(el, k, 7) !== 7 || num(el, k + 1, 0) !== 0 || num(el, k + 2, 0) !== 0) return null;
    const c = chipSpacing(el);
    if (c !== 2 * unit) return null;
    return { type: "seven-segment", props: {}, posts: 4, place: { at: [el.x1, el.y1], toward: [el.x1 + c, el.y1], flip: false } };
  },

  // DecimalDisplayElm (ChipElm 3 wide): bitCount displayMode; inputs W0.. with the MSB on top.
  "419": (el, unit) => {
    const k = el.flags & (1 << 13) ? 1 : 0;
    const bits = num(el, k, 4);
    if (el.flags & CHIP_FLIP_FLAGS || bits < 1 || bits > 16) return null;
    const c = chipSpacing(el);
    if (c !== 2 * unit) return null;
    const mode = ["decimal", "hex", "octal"][num(el, k + 1, 0)] ?? "decimal";
    return { type: "number-display", props: { bits, mode }, posts: 4, place: { at: [el.x1, el.y1], toward: [el.x1 + c, el.y1], flip: false } };
  },
};





