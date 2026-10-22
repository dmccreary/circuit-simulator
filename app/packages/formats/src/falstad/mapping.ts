// The one table that maps Falstad element lines onto our part types and prop
// keys. Argument orders come from each element's StringTokenizer constructor
// and dump() in CircuitJS1, under
// https://github.com/pfalstad/circuitjs1/tree/master/src/com/lushprojects/circuitjs1/client
// (ResistorElm, CapacitorElm, InductorElm, VoltageElm, CurrentElm, SwitchElm,
// PushSwitchElm, PotElm, DiodeElm, LEDElm, LampElm, AmmeterElm, ProbeElm, GroundElm).
// Parameters listed below are the tokens after "type x1 y1 x2 y2 flags".

import type { PropValue } from "@cs/model";
import type { FalstadElement } from "./text";

export interface PartMapping {
  type: string;
  props: Record<string, PropValue>;
  savedState?: number[];
  /** Terminal count, used for geometry and for placeholders. */
  posts: 1 | 2 | 3;
  /** True when Falstad's first point is our terminal 1 (sources: Falstad puts "-" first, we put "+" first). */
  reversed?: boolean;
  /** Distance between terminals 0 and 1 for parts that do not stretch (potentiometer). */
  fixedLength?: number;
  /** Falstad edit-item index -> our prop key, for `&`/`38` slider lines. */
  sliderProps?: Record<number, string>;
}

export const LABEL_PREFIX: Record<string, string> = {
  ground: "",
  resistor: "R",
  capacitor: "C",
  inductor: "L",
  battery: "V",
  "dc-source": "V",
  "ac-source": "V",
  "square-source": "V",
  "current-source": "I",
  switch: "S",
  "push-button": "S",
  potentiometer: "R",
  diode: "D",
  led: "D",
  lamp: "L",
  ammeter: "A",
  voltmeter: "V",
  "falstad:placeholder": "X",
};

export const PLACEHOLDER_TYPE = "falstad:placeholder";

/** Falstad codes whose elements have one post (for placeholders). */
export const ONE_POST_CODES = new Set(["g", "R", "O", "A", "L", "M", "172"]);

const num = (el: FalstadElement, i: number, fallback = 0): number => {
  const v = Number(el.params[i]);
  return el.params[i] === undefined || Number.isNaN(v) ? fallback : v;
};

// VoltageElm waveforms
const WF_DC = 0;
const WF_AC = 1;
const WF_SQUARE = 2;
const FLAG_COS = 2;
const FLAG_CIRCLE_SYMBOL = 8;

const RAD_TO_DEG = 180 / Math.PI;

type Rule = (el: FalstadElement) => PartMapping | null;

export const FALSTAD_PARTS: Record<string, Rule> = {
  // GroundElm: [symbolType]
  g: () => ({ type: "ground", props: {}, posts: 1 }),

  // ResistorElm: resistance
  r: (el) => ({ type: "resistor", props: { resistance: num(el, 0, 1000) }, posts: 2, sliderProps: { 0: "resistance" } }),

  // CapacitorElm: capacitance voltdiff [initialVoltage [seriesResistance]]
  c: (el) => ({
    type: "capacitor",
    props: { capacitance: num(el, 0, 1e-5), initialVoltage: num(el, 2, 0) },
    savedState: [num(el, 1, 0), 0, 0], // model layout: value, then two history slots
    posts: 2,
    sliderProps: { 0: "capacitance" },
  }),

  // InductorElm: inductance current [initialCurrent [saturationCurrent]]
  l: (el) => ({
    type: "inductor",
    props: { inductance: num(el, 0, 1), initialCurrent: num(el, 2, 0) },
    savedState: [num(el, 1, 0), 0, 0], // model layout: value, then two history slots
    posts: 2,
    sliderProps: { 0: "inductance" },
  }),

  // VoltageElm: waveform frequency maxVoltage bias phaseShift dutyCycle.
  // Falstad's first point is the negative terminal. A DC source is maxVoltage + bias.
  v: (el): PartMapping | null => {
    const wf = num(el, 0, WF_DC);
    const frequency = num(el, 1, 40);
    const amplitude = num(el, 2, 5);
    const offset = num(el, 3, 0);
    const phase = (el.flags & FLAG_COS ? Math.PI / 2 : num(el, 4, 0)) * RAD_TO_DEG;
    const base = { posts: 2 as const, reversed: true };
    if (wf === WF_DC) {
      const type = el.flags & FLAG_CIRCLE_SYMBOL ? "dc-source" : "battery";
      return { ...base, type, props: { voltage: amplitude + offset }, sliderProps: { 0: "voltage" } };
    }
    if (wf === WF_AC) {
      return {
        ...base,
        type: "ac-source",
        props: { amplitude, frequency, offset, phase },
        sliderProps: { 0: "amplitude", 2: "offset" },
      };
    }
    if (wf === WF_SQUARE) {
      return {
        ...base,
        type: "square-source",
        props: { amplitude, frequency, offset, phase, dutyCycle: num(el, 5, 0.5) * 100 },
        sliderProps: { 0: "amplitude", 2: "offset" },
      };
    }
    return null; // triangle, sawtooth, pulse, noise, variable
  },

  // CurrentElm: currentValue maxVoltage
  i: (el) => ({ type: "current-source", props: { current: num(el, 0, 0.01) }, posts: 2, sliderProps: { 0: "current" } }),

  // SwitchElm: position ("true"/"false" or 0/1; 0 = closed) momentary [label]
  s: (el): PartMapping => {
    const p = el.params[0];
    const position = p === "true" ? 1 : p === "false" ? 0 : num(el, 0, 0);
    const momentary = el.params[1] === "true";
    return momentary
      ? { type: "push-button", props: { pressed: position === 0 }, posts: 2 }
      : { type: "switch", props: { closed: position === 0 }, posts: 2 };
  },

  // PotElm: maxResistance position sliderText...
  "174": (el) => ({
    type: "potentiometer",
    props: { resistance: num(el, 0, 1000), position: num(el, 1, 0.5) },
    posts: 3,
    fixedLength: 4,
    sliderProps: { 0: "resistance" },
  }),

  // DiodeElm: [modelName] (flag 2) or [fwdrop] (flag 1)
  d: () => ({ type: "diode", props: {}, posts: 2 }),

  // LEDElm: the DiodeElm tokens, then colorR colorG colorB [maxBrightnessCurrent].
  // Falstad's forward drop is not mapped: our forwardVoltage applies only to color "custom".
  "162": (el) => {
    const skip = el.flags & 3 ? 1 : 0;
    const props: Record<string, PropValue> = {
      color: nearestColor(num(el, skip, 1), num(el, skip + 1, 0), num(el, skip + 2, 0)),
    };
    if (el.params[skip + 3] !== undefined) props.fullBrightnessCurrent = num(el, skip + 3, 0.01);
    return { type: "led", props, posts: 2 };
  },

  // LampElm: temp nom_pow nom_v warmTime coolTime
  "181": (el) => ({ type: "lamp", props: { ratedVoltage: num(el, 2, 120), ratedPower: num(el, 1, 100) }, posts: 2 }),

  // AmmeterElm: meter scale
  "370": () => ({ type: "ammeter", props: {}, posts: 2 }),

  // ProbeElm (voltmeter): meter scale resistance
  p: () => ({ type: "voltmeter", props: {}, posts: 2 }),
};

const COLORS: [string, number, number, number][] = [
  ["red", 1, 0, 0],
  ["green", 0, 1, 0],
  ["blue", 0, 0, 1],
  ["yellow", 1, 1, 0],
  ["orange", 1, 0.5, 0],
  ["white", 1, 1, 1],
];

function nearestColor(r: number, g: number, b: number): string {
  let best = COLORS[0];
  let bestD = Infinity;
  for (const c of COLORS) {
    const d = (c[1] - r) ** 2 + (c[2] - g) ** 2 + (c[3] - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best[0];
}
