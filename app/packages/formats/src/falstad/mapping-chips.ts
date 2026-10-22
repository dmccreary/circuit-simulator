// Falstad mappings for the CircuitJS1 ChipElm families in @cs/elements
// (counters, multiplexers, ROM, converters, custom logic...), one part type per
// size. Token orders come from each class's StringTokenizer constructor in
// https://github.com/pfalstad/circuitjs1/tree/master/src/com/lushprojects/circuitjs1/client
// (ChipElm, CounterElm, Counter2Elm, RingCounterElm, MultiplexerElm,
// DeMultiplexerElm, FullAdderElm, TFlipFlopElm, LatchElm, DACElm, ADCElm,
// SevenSegDecoderElm, CustomLogicElm/CustomLogicModel, LEDArrayElm, SRAMElm/ROMElm).
//
// ChipElm's constructor reads, after "type x1 y1 x2 y2 flags": the bit count
// (needsBits() chips), the high voltage (FLAG_CUSTOM_VOLTAGE = 1 << 13), the
// voltage of each pin with `state` set (outputs whose value is saved), then
// the subclass's own tokens. Pin layouts mirror the specs in @cs/elements
// (chip-kit/layout.ts and each part's descriptor.ts); the local origin of our
// part is its terminal 0. Flipped chips and 32-pixel chips in 8-pixel circuits
// go through chipVariant (mapping-variants.ts).
//
// XML <cir> files: CHIP_XML_PARAMS puts each element's attributes back in
// text-token order; ChipElm's "bo" (bit order) and the multiplexer's "im" /
// demultiplexer's "om" modes travel in flag bits above CircuitJS1's own.

import type { PropValue } from "@cs/model";
import type { PartMapping } from "./mapping";
import { E, N, S, W, chipVariant, type ChipLayout, type Pt } from "./mapping-variants";
import { unescapeFalstad, type FalstadCircuit, type FalstadElement } from "./text";

type Rule = (el: FalstadElement, unit: number, fc?: FalstadCircuit) => PartMapping | null;

const FLAG_SMALL = 1;
const FLAG_CUSTOM_VOLTAGE = 1 << 13;
/** XML "bo" (ChipElm bitOrder: 1 = LSB first, 2 = bus) and "im"/"om" (mux modes), stored by the XML reader. */
export const XML_BIT_ORDER_SHIFT = 24;
export const XML_MODE_SHIFT = 26;
const xmlBitOrder = (el: FalstadElement) => (el.flags >> XML_BIT_ORDER_SHIFT) & 3;
const xmlMode = (el: FalstadElement) => (el.flags >> XML_MODE_SHIFT) & 3;

const num = (el: FalstadElement, i: number, fallback = 0): number => {
  const v = Number(el.params[i]);
  return el.params[i] === undefined || el.params[i] === "" || Number.isNaN(v) ? fallback : v;
};

/** Reads ChipElm's leading tokens in order. */
class Tokens {
  k = 0;
  readonly props: Record<string, PropValue> = {};
  constructor(private readonly el: FalstadElement, bits?: number) {
    if (bits !== undefined) this.bits = num(el, this.k++, bits);
    if (el.flags & FLAG_CUSTOM_VOLTAGE) this.props.supply = num(el, this.k++, 5);
  }
  bits = 0;
  next(fallback = 0): number {
    return num(this.el, this.k++, fallback);
  }
  text(): string | undefined {
    return this.el.params[this.k++];
  }
  /** Saved pin voltages as logic values (ChipElm: volts > highVoltage / 2). */
  levels(count: number): boolean[] {
    const th = (typeof this.props.supply === "number" ? this.props.supply : 5) / 2;
    return Array.from({ length: count }, () => this.next(0) > th);
  }
}

/** Chip state layout of @cs/elements chip-kit/model.ts: [lastClock, pin 0, pin 1, ...]. */
function chipState(pins: number, set: Record<number, boolean>): number[] {
  const out = new Array<number>(1 + pins).fill(0);
  for (const [pin, v] of Object.entries(set)) out[1 + Number(pin)] = v ? 1 : 0;
  return out;
}

/** Placement of an unflipped chip whose terminal 0 sits at `pin0` (in pin spacings from point1). */
function place(el: FalstadElement, unit: number, pin0: Pt): PartMapping["place"] | null {
  const c = el.flags & FLAG_SMALL ? 16 : 32;
  if (c !== 2 * unit) return null;
  const at: Pt = [el.x1 + c * pin0[0], el.y1 + c * pin0[1]];
  return { at, toward: [at[0] + c, at[1]], flip: false };
}

/** MSB-first bit pins (ChipElm.makeBitPins): bit i at slot pos + count-1-i. */
const bitSlots = (count: number, pos: number, side: (k: number) => Pt): Pt[] =>
  Array.from({ length: count }, (_, k) => side(pos + k));

interface Chip {
  type: string;
  sizeX: number;
  sizeY: number;
  /** Posts in terminal order, in pin spacings. */
  pins: Pt[];
  props?: Record<string, PropValue>;
  savedState?: number[];
  wires?: Pt[][];
  /** Bus form (bit order "bus"): terminal 0 is `pin0`, out from its post; no flips or fans. */
  bus?: { pin0: Pt };
}

/** A rule from a chip reader (null = not mapped) through chipVariant's flips and fans. */
function chipRule(read: (el: FalstadElement, fc?: FalstadCircuit) => Chip | null): Rule {
  return (el, unit, fc) => {
    const layout = (e: FalstadElement): ChipLayout | null => {
      const c = read(e, fc);
      return c && !c.bus ? { sizeX: c.sizeX, sizeY: c.sizeY, pins: c.pins } : null;
    };
    return chipVariant((e, u) => {
      const c = read(e, fc);
      if (!c || (xmlBitOrder(e) !== 0 && !c.bus)) return null;
      const p = place(e, u, c.bus?.pin0 ?? c.pins[0]);
      if (!p) return null;
      const m: PartMapping = { type: c.type, props: c.props ?? {}, posts: 4, place: p };
      if (c.savedState) m.savedState = c.savedState;
      return m;
    }, layout)(el, unit);
  };
}

const oneOf = (v: number, allowed: readonly number[]) => allowed.includes(v);

// ---------------------------------------------------------------- readers

/** CounterElm: bits, Q volts, invertreset, modulus. FLAG_UP_DOWN = 4 is not mapped; FLAG_NEGATIVE_EDGE = 8. */
const counter = chipRule((el) => {
  const t = new Tokens(el, 4);
  const bits = t.bits;
  if (el.flags & 4 || !oneOf(bits, [3, 4, 8])) return null;
  const q = t.levels(bits);
  const inv = t.text();
  const invertReset = inv === undefined ? true : inv === "true";
  const modulus = t.next(0);
  const state: Record<number, boolean> = {};
  q.forEach((v, i) => (state[2 + i] = v));
  return {
    type: `counter-${bits}`,
    sizeX: 2,
    sizeY: bits,
    pins: [W(0), W(bits - 1), ...bitSlots(bits, 0, (k) => E(2, k))],
    props: { ...t.props, invertReset, modulus, negativeEdge: (el.flags & 8) !== 0 },
    savedState: chipState(bits + 2, state),
  };
});

/** Counter2Elm: bits, Q volts, modulus. */
const syncCounter = chipRule((el) => {
  const t = new Tokens(el, 4);
  const b = t.bits;
  const bus = xmlBitOrder(el) === 2;
  if (!oneOf(b, bus ? [4] : [4, 8])) return null;
  const q = t.levels(b);
  const modulus = t.next(0);
  const state: Record<number, boolean> = {};
  q.forEach((v, i) => (state[i] = v));
  if (bus) {
    // Q bus at E1 (index 0 is bit b-1, b-1 units out), I bus at W1, then CLK W0, CLR W2, EnP W3, RCO E0, LOAD E2, EnT E3.
    const pins = [E(2, 1), W(1), W(0), W(2), W(3), E(2, 0), E(2, 2), E(2, 3)];
    return {
      type: `sync-counter-${b}-bus`,
      sizeX: 2,
      sizeY: 4,
      pins,
      bus: { pin0: [2, 2] }, // Q bit b-1 inside the box (grid (4, 4))
      props: { ...t.props, modulus },
      savedState: chipState(2 * b + 6, state),
    };
  }
  return {
    type: `sync-counter-${b}`,
    sizeX: 2,
    sizeY: b + 3,
    pins: [
      ...bitSlots(b, 1, (k) => E(2, k)),
      ...bitSlots(b, 1, (k) => W(k)),
      W(0),
      W(b + 1),
      W(b + 2),
      E(2, 0),
      E(2, b + 1),
      E(2, b + 2),
    ],
    props: { ...t.props, modulus },
    savedState: chipState(2 * b + 6, state),
  };
});

/** RingCounterElm: bits, Q volts. FLAG_CLOCK_INHIBIT = 2 adds CE̅, FLAG_RESET_HIGH = 4. */
const ringCounter = chipRule((el) => {
  const t = new Tokens(el, 10);
  const bits = t.bits;
  if (!oneOf(bits, [4, 10])) return null;
  const ce = (el.flags & 2) !== 0;
  const q = t.levels(bits);
  const sizeX = Math.max(2, bits);
  const state: Record<number, boolean> = {};
  q.forEach((v, i) => (state[2 + i] = v));
  return {
    type: `ring-counter-${bits}${ce ? "-ce" : ""}`,
    sizeX,
    sizeY: 2,
    pins: [W(1), S(2, sizeX - 1), ...Array.from({ length: bits }, (_, i) => N(i)), ...(ce ? [S(2, 1)] : [])],
    props: { ...t.props, invertReset: (el.flags & 4) === 0 },
    savedState: chipState(bits + 2 + (ce ? 1 : 0), state),
  };
});

/** MultiplexerElm: selectBitCount. FLAG_INVERTED_OUTPUT = 2, FLAG_STROBE = 4, FLAG_BUS_SELECT = 8 and the bus modes are not mapped. */
const mux = chipRule((el) => {
  const t = new Tokens(el);
  const sel = t.next(2);
  const dw = t.next(4);
  const n = 1 << sel;
  if (xmlMode(el) === 2 && !(el.flags & (2 | 4 | 8)) && sel === 2 && dw === 4) {
    const pins = [...Array.from({ length: n }, (_, i) => W(i)), ...Array.from({ length: sel }, (_, i) => S(n + 1, i + 1)), E(sel + 1, 0)];
    return { type: `multiplexer-${sel}-bus${dw}`, sizeX: sel + 1, sizeY: n + 1, pins, bus: { pin0: [1, 0] }, props: t.props };
  }
  if (el.flags & (2 | 4 | 8) || xmlMode(el) !== 0 || !oneOf(sel, [1, 2, 3])) return null;
  return {
    type: `multiplexer-${sel}`,
    sizeX: sel + 1,
    sizeY: n + 1,
    pins: [...Array.from({ length: n }, (_, i) => W(i)), ...Array.from({ length: sel }, (_, i) => S(n + 1, i + 1)), E(sel + 1, 0)],
    props: t.props,
  };
});

/** DeMultiplexerElm: selectBitCount. FLAG_INVERT_OUTPUTS = 16; FLAG_BUS_SELECT = 8 and the bus modes are not mapped. */
const demux = chipRule((el) => {
  const t = new Tokens(el);
  const sel = t.next(2) || 2;
  if (el.flags & 8 || xmlMode(el) !== 0 || !oneOf(sel, [1, 2, 3])) return null;
  const n = 1 << sel;
  const sizeX = sel + 1;
  return {
    type: `demultiplexer-${sel}`,
    sizeX,
    sizeY: n + 1,
    pins: [...Array.from({ length: n }, (_, i) => E(sizeX, i)), ...Array.from({ length: sel }, (_, i) => S(n + 1, i)), W(0)],
    props: { ...t.props, idleHigh: (el.flags & 16) !== 0 },
  };
});

/** FullAdderElm: bits only with FLAG_BITS = 2 (else 1 bit). */
const adder = chipRule((el) => {
  const t = new Tokens(el, el.flags & 2 ? 4 : undefined);
  const b = el.flags & 2 ? t.bits : 1;
  if (xmlBitOrder(el) === 2) {
    if (b !== 4) return null;
    return { type: `full-adder-${b}-bus`, sizeX: 2, sizeY: 3, pins: [W(0), W(1), E(2, 2), W(2), E(2, 0)], bus: { pin0: [1, 0] }, props: t.props };
  }
  if (!oneOf(b, [1, 4])) return null;
  return {
    type: b === 1 ? "full-adder" : `full-adder-${b}`,
    sizeX: 2,
    sizeY: 2 * b + 1,
    pins: [
      ...bitSlots(b, 0, W).reverse(),
      ...bitSlots(b, b, W).reverse(),
      ...bitSlots(b, 2, (k) => E(2, k)).reverse(),
      W(2 * b),
      E(2, 0),
    ],
    props: t.props,
  };
});

/** TFlipFlopElm: Q volts. FLAG_RESET = 2, FLAG_SET = 4. */
const tff = chipRule((el) => {
  const t = new Tokens(el);
  const q = t.levels(1)[0];
  const set = (el.flags & 4) !== 0;
  const reset = (el.flags & 2) !== 0 || set;
  const pins: Pt[] = [W(0), E(2, 0), E(2, set ? 1 : 2), W(1)];
  if (set) pins.push(E(2, 2), W(2));
  else if (reset) pins.push(W(2));
  return {
    type: set ? "t-flip-flop-sr" : reset ? "t-flip-flop-r" : "t-flip-flop",
    sizeX: 2,
    sizeY: 3,
    pins,
    props: t.props,
    savedState: chipState(pins.length, { 1: q, 2: !q }),
  };
});

/** LatchElm: bits, O volts when FLAG_STATE = 2. FLAG_NO_EDGE = 4; reset (8), set (16) and enables (32, 64) are not mapped. */
const latch = chipRule((el) => {
  const t = new Tokens(el, 4);
  const b = t.bits;
  if (el.flags & (8 | 16 | 32 | 64) || !oneOf(b, [4, 8])) return null;
  const o = el.flags & 2 ? t.levels(b) : [];
  const state: Record<number, boolean> = {};
  o.forEach((v, i) => (state[b + i] = v));
  return {
    type: `latch-${b}`,
    sizeX: 2,
    sizeY: b + 1,
    pins: [...bitSlots(b, 0, W).reverse(), ...bitSlots(b, 0, (k) => E(2, k)).reverse(), W(b)],
    props: { ...t.props, edgeTriggered: (el.flags & 4) === 0 },
    savedState: chipState(2 * b + 1, state),
  };
});

/** DACElm / ADCElm: bits. */
const converter = (adc: boolean) =>
  chipRule((el) => {
    const t = new Tokens(el, 4);
    const b = t.bits;
    if (!oneOf(b, [4, 8])) return null;
    const rows = Math.max(2, b);
    const bitsSide = adc ? (k: number) => E(2, k) : W;
    const other = adc ? W : (k: number) => E(2, k);
    return {
      type: `${adc ? "adc" : "dac"}-${b}`,
      sizeX: 2,
      sizeY: rows,
      pins: [...bitSlots(b, 0, bitsSide).reverse(), other(0), other(rows - 1)],
      props: t.props,
    };
  });

/** SevenSegDecoderElm: segmentType (only 0, seven segments). FLAG_ENABLE = 2 adds BI̅, FLAG_BLANK_F = 4. */
const decoder = chipRule((el) => {
  const t = new Tokens(el);
  if (t.next(0) !== 0) return null;
  const blank = (el.flags & 2) !== 0;
  return {
    type: blank ? "seven-seg-decoder-bi" : "seven-seg-decoder",
    sizeX: 3,
    sizeY: 7,
    pins: [...Array.from({ length: 7 }, (_, i) => E(3, i)), ...bitSlots(4, 0, W), ...(blank ? [W(4)] : [])],
    props: { ...t.props, blankOnF: (el.flags & 4) !== 0 },
  };
});

/** LEDArrayElm: sizeX sizeY (columns along the bottom, rows down the left). */
const ledArray = chipRule((el) => {
  const t = new Tokens(el);
  const cols = t.next(8);
  const rows = t.next(8);
  if (!((cols === 8 && rows === 8) || (cols === 5 && rows === 7))) return null;
  return {
    type: `led-array-${cols}x${rows}`,
    sizeX: cols,
    sizeY: rows,
    pins: [...Array.from({ length: cols }, (_, i) => S(rows, i)), ...Array.from({ length: rows }, (_, i) => W(i))],
    props: t.props,
  };
});

/** SRAMElm / ROMElm: addressBits dataBits, then runs "address value value ... -1", ending with -2. */
const rom = chipRule((el) => {
  const t = new Tokens(el);
  const ab = t.next(4);
  const db = t.next(4);
  if (!oneOf(ab, [4, 8]) || !oneOf(db, [4, 8])) return null;
  const lines: string[] = [];
  for (;;) {
    const a = Number(t.text());
    if (!Number.isInteger(a) || a < 0) break;
    const vals: number[] = [];
    for (;;) {
      const v = Number(t.text());
      if (!Number.isInteger(v) || v < 0) break;
      vals.push(v);
    }
    if (vals.length) lines.push(`${a}: ${vals.join(" ")}`);
  }
  if (xmlBitOrder(el) === 2) {
    if (ab !== 4 || db !== 8) return null;
    return {
      type: `rom-${ab}x${db}-bus`,
      sizeX: 2,
      sizeY: 2,
      pins: [W(0), W(1), E(2, 1)],
      bus: { pin0: [0, 0] },
      props: { ...t.props, contents: lines.join("\n") },
    };
  }
  const sizeY = Math.max(ab, db) + 1;
  return {
    type: `rom-${ab}x${db}`,
    sizeX: 2,
    sizeY,
    pins: [W(0), ...bitSlots(ab, sizeY - ab, W), ...bitSlots(db, sizeY - db, (k) => E(2, k))],
    props: { ...t.props, contents: lines.join("\n") },
  };
});

const CUSTOM_SIZES = new Set(["3x8", "4x8", ...[1, 2, 3, 4].flatMap((i) => [1, 2, 3, 4].map((o) => `${i}x${o}`))]);
const SEP = /[ +\t\n\r\f]+/;

/** CustomLogicElm: modelName, output volts. The model is a "!" line: name flags inputs outputs infoText rules. */
const customLogic = chipRule((el, fc) => {
  const t = new Tokens(el);
  const name = t.text();
  if (name === undefined || !fc) return null;
  const line = fc.models.map((m) => m.trim().split(SEP)).find((tk) => tk[0] === "!" && unescapeFalstad(tk[1] ?? "") === unescapeFalstad(name));
  if (!line || line.length < 6) return null;
  const inputs = unescapeFalstad(line[3]).split(",");
  const outputs = unescapeFalstad(line[4]).split(",");
  const ni = inputs.length;
  const no = outputs.length;
  if (!CUSTOM_SIZES.has(`${ni}x${no}`)) return null;
  const outs = t.levels(no);
  const state: Record<number, boolean> = {};
  outs.forEach((v, i) => (state[ni + i] = v));
  return {
    type: `custom-logic-${ni}x${no}`,
    sizeX: 2,
    sizeY: Math.max(1, ni, no),
    pins: [...Array.from({ length: ni }, (_, i) => W(i)), ...Array.from({ length: no }, (_, i) => E(2, i))],
    props: {
      ...t.props,
      inputNames: inputs.join(","),
      outputNames: outputs.join(","),
      title: unescapeFalstad(line[5] ?? ""),
      rules: unescapeFalstad(line[6] ?? ""),
    },
    savedState: chipState(ni + no, state),
  };
});

export const CHIP_FALSTAD_PARTS: Record<string, Rule> = {
  "164": counter,
  "421": syncCounter,
  "163": ringCounter,
  "184": mux,
  "185": demux,
  "196": adder,
  "193": tff,
  "168": latch,
  "166": converter(false),
  "167": converter(true),
  "197": decoder,
  "405": ledArray,
  "436": rom,
  "208": customLogic,
  // BusLogicInputElm / InstructionDisplayElm (XML only): the bus post at point1, drawn toward point2.
  bli: (el) => busEnd(el, "bus-input", [4, 8], { value: num(el, 1, 0), supply: num(el, 2, 5) }),
  ins: (el) => busEnd(el, "instruction-display", [4, 5, 8], { threshold: num(el, 1, 2.5), lookup: el.params[2] ?? "" }),
  // BusSplitterElm: expanded into net labels by bus.ts; nothing is left to place.
};

function busEnd(el: FalstadElement, type: string, widths: number[], props: Record<string, PropValue>): PartMapping | null {
  const w = num(el, 0, 4);
  if (!widths.includes(w) || (el.x1 !== el.x2) === (el.y1 !== el.y2)) return null;
  return { type: `${type}-${w}`, props, posts: 4, place: { at: [el.x1, el.y1], toward: [el.x2, el.y2], flip: false } };
}

export const CHIP_LABEL_PREFIX: Record<string, string> = {
  "led-array-8x8": "D",
  "led-array-5x7": "D",
};

// ---------------------------------------------------------------- XML

type Tok = [attr: string, fallback: string] | { literal: string };
type Template = (a: Record<string, string>, flags: number, text?: string) => { params: Tok[]; flags?: number };

const hv = (f: number): Tok[] => (f & FLAG_CUSTOM_VOLTAGE ? [["hv", "5"]] : []);
const volts = (from: number, count: number): Tok[] => Array.from({ length: count }, (_, i) => [`v${from + i}`, "0"] as Tok);
const bits = (a: Record<string, string>, fallback: number) => Number(a.bi ?? fallback) || fallback;
/** ChipElm's "bo" and the mux modes, kept in high flag bits for the rules above. */
const extra = (a: Record<string, string>, f: number, mode?: string) =>
  f | ((Number(a.bo ?? 0) & 3) << XML_BIT_ORDER_SHIFT) | ((Number((mode && a[mode]) ?? 0) & 3) << XML_MODE_SHIFT);

/** SRAMElm.parseContentsString(): "address: value value" lines -> the text format's runs. */
function romTokens(text: string, hex: boolean): Tok[] {
  const parse = (s: string) => (s.startsWith("0x") ? parseInt(s.slice(2), 16) : hex ? parseInt(s, 16) : s.startsWith("0b") ? parseInt(s.slice(2), 2) : Number(s));
  const out: Tok[] = [];
  for (const line of text.split("\n")) {
    const m = /^\s*([^:\s]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const addr = parse(m[1]);
    const vals = m[2].trim().split(/\s+/).filter(Boolean).map(parse);
    if (!Number.isInteger(addr) || !vals.length || vals.some((v) => !Number.isInteger(v))) continue;
    out.push({ literal: String(addr) }, ...vals.map((v) => ({ literal: String(v) })), { literal: "-1" });
  }
  out.push({ literal: "-2" });
  return out;
}

export const CHIP_XML_PARAMS: Record<string, Template> = {
  "164": (a, f) => ({ params: [["bi", "4"], ...hv(f), ...volts(2, bits(a, 4)), ["in", "false"], ["mo", "0"]], flags: extra(a, f) }),
  "421": (a, f) => ({ params: [["bi", "4"], ...hv(f), ...volts(0, bits(a, 4)), ["mo", "0"]], flags: extra(a, f) }),
  "163": (a, f) => ({ params: [["bi", "10"], ...hv(f), ...volts(2, bits(a, 10))], flags: extra(a, f) }),
  "184": (a, f) => ({ params: [...hv(f), ["se", "2"], ["dw", "4"]], flags: extra(a, f, "im") }),
  "185": (a, f) => ({ params: [...hv(f), ["se", "2"]], flags: extra(a, f, "om") }),
  "196": (a, f) => ({ params: [...(f & 2 ? [["bi", "4"] as Tok] : []), ...hv(f)], flags: extra(a, f) }),
  "193": (a, f) => ({ params: [...hv(f), ["v1", "0"]], flags: extra(a, f) }),
  "168": (a, f) => ({ params: [["bi", "4"], ...hv(f), ...(f & 2 ? volts(bits(a, 4), bits(a, 4)) : [])], flags: extra(a, f) }),
  "166": (a, f) => ({ params: [["bi", "4"], ...hv(f)], flags: extra(a, f) }),
  "167": (a, f) => ({ params: [["bi", "4"], ...hv(f)], flags: extra(a, f) }),
  "197": (a, f) => ({ params: [...hv(f), ["sgt", "0"]], flags: extra(a, f) }),
  "433": (a, f) => ({ params: [["bi", "4"], ...hv(f)] }),
  bli: () => ({ params: [["bw", "4"], ["va", "0"], ["hi", "5"], ["lo", "0"]] }),
  ins: (_a, _f, text = "") => ({ params: [["bw", "4"], ["th", "2.5"], { literal: text }] }),
  "405": (a, f) => ({ params: [...hv(f), ["sx", "8"], ["sy", "8"]], flags: extra(a, f) }),
  // FLAG_HEX_DISPLAY = 4: the contents' unprefixed numbers are hexadecimal.
  "436": (a, f, text = "") => ({ params: [...hv(f), ["ab", "4"], ["db", "4"], ...romTokens(text, (f & 4) !== 0)], flags: extra(a, f) }),
};
