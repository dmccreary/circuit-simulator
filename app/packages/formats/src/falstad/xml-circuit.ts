// Parser for Falstad's XML circuit format (<cir ...>) into the same neutral
// FalstadCircuit the text parser produces, so the mapper works unchanged.
//
// Layout, from CircuitJS1 (the commit the example library is pinned to):
// https://github.com/pfalstad/circuitjs1/blob/5a707168778216bb6ed01bfdd62e8bbf7ae0a032/src/com/lushprojects/circuitjs1/client/
//   XMLSerializer.dumpCircuit()   root <cir f ts ic cb pb vr mts [st]>, one child per element,
//                                 then scopes <o> and sliders <adj>
//   XMLDeserializer.readCircuit() / readElements()   the reader this file follows
//   CircuitElm.dumpXml()          x="x1 y1 x2 y2" f="flags"; each element adds named attributes
//   CircuitElm.getXmlDumpType()   the tag: the type character for codes 65..126, else a short
//                                 name ("LED", "And", "ctr2"); see XML_TAGS below
//   ScopeSerializer.undumpXml()   <o en sp f p> with <p v sc> plot children
//   Adjustable.undumpXml()        <adj e ei en mn mx st log>
// Each element's attributes are put back in the order of its text-format tokens
// (XML_PARAMS), so FALSTAD_PARTS reads both formats.

import type { FalstadCircuit, FalstadElement, FalstadSettings } from "./text";
import { parseXml, type XmlNode } from "./xml";

/** XML tag -> text type code, for tags that are not the code itself (getXmlDumpType()). */
const XML_TAGS: Record<string, string> = {
  ADC: "167", AM: "200", Ammeter: "370", AnalogMux: "432", as2: "160", as: "159", And: "150", ain: "411",
  aout: "211", bs: "433", CC2: "179", CCCS: "215", CCVS: "214", Comparator: "401", ctr2: "421", ctr: "164",
  CrossSwitch: "430", cr: "412", cc: "410", cl: "208", CustomTransformer: "406", DAC: "166", DCMotor: "415",
  DFlipFlop: "155", dpdt: "429", dar: "400", DataInput: "424", DataRecorder: "210", dmux: "185", dd: "419",
  DelayBuffer: "422", Diac: "203", ExtVoltage: "418", FM: "201", FullAdder: "196", Fuse: "404", HalfAdder: "195",
  InvertingSchmitt: "183", JKFlipFlop: "156", LDR: "374", LEDArray: "405", LED: "162", ln: "207", Lamp: "181",
  Latch: "168", Line: "423", MBBSwitch: "416", Monostable: "194", MotorProtectionSwitch: "428", mux: "184",
  Nand: "151", Nor: "153", OTA: "402", OhmMeter: "216", OpAmpReal: "409", Optocoupler: "407", Or: "152",
  PhaseComp: "161", PisoShift: "186", pc: "209", pt: "174", ROM: "436", RelayCoil: "425", RelayContact: "426",
  rl: "178", RingCounter: "163", SCR: "177", SRAM: "413", Schmitt: "182", Scope: "403", SeqGen: "188",
  SevenSegDecoder: "197", ssd: "157", SipoShift: "189", SparkGap: "187", StopTrigger: "408", sw: "170",
  TFlipFlop: "193", tt: "169", TestPoint: "368", ThermistorNTC: "350", ThreePhaseMotor: "427",
  TimeDelayRelay: "414", Timer: "165", tl: "171", ts: "180", Triac: "206", Triode: "173", TunnelDiode: "175",
  Unijunction: "417", VCCS: "213", VCO: "158", VCVS: "212", VarRail: "172", Varactor: "176", Wattmeter: "420",
  Xnor: "431", Xor: "154",
  rw: "w", // RoutedWireElm: a wire whose route is the element's text, "x,y;x,y;..."
};

/** Model definitions read by XMLDeserializer.readElements(); kept raw like the text format's "!" lines. */
const MODEL_TAGS = new Set(["dm", "rlm", "tm", "mm", "clm", "ccm"]);

/** One text token: an attribute with its constructor default, or a literal. */
type Tok = [attr: string, fallback: string] | { literal: string };
type Template = (a: Record<string, string>, flags: number) => { params: Tok[]; flags?: number };

const fixed =
  (...params: Tok[]): Template =>
  () => ({ params });

const VOLTAGE: Tok[] = [["wf", "0"], ["fr", "40"], ["maxv", "5"], ["bias", "0"], ["phaseShift", "0"], ["dutyCycle", "0.5"]];
const GATE = fixed(["in", "2"], ["o", "0"], ["hi", "5"]);
// VCCSElm family: ChipElm's "hv" (FLAG_CUSTOM_VOLTAGE), then input count and the formula.
const EXPR: Template = (_a, f) => ({ params: [...(f & (1 << 13) ? [["hv", "5"] as Tok] : []), ["ic", "2"], ["ex", "0"]] });

/** Text-format token order per type code, from each element's dump() and undumpXml(). */
const XML_PARAMS: Record<string, Template> = {
  r: fixed(["r", "1000"]),
  c: fixed(["c", "1e-5"], ["vd", "0"], ["iv", "0"]),
  l: fixed(["l", "1"], ["i", "0"], ["ic", "0"]),
  v: fixed(...VOLTAGE),
  R: fixed(...VOLTAGE),
  "172": fixed(...VOLTAGE, ["st", "Voltage"]),
  i: fixed(["cu", "0.01"], ["mv", "0"]),
  s: fixed(["p", "0"], ["mm", "false"]),
  S: fixed(["p", "0"], ["mm", "false"], ["li", "0"], ["th", "2"]),
  L: (_a, f) => ({ params: f & 4 ? [["p", "0"], ["mm", "false"], ["lab", ""], ["hi", "5"], ["lo", "0"]] : [["p", "0"], ["mm", "false"], ["hi", "5"], ["lo", "0"]] }),
  M: fixed(["th", "2.5"]),
  O: fixed(["sc", "0"]),
  I: fixed(["sl", "0.5"], ["hi", "5"]),
  "150": GATE,
  "151": GATE,
  "152": GATE,
  "153": GATE,
  "154": GATE,
  "174": fixed(["ma", "1000"], ["po", "0.5"], ["sl", "Resistance"]),
  d: fixed(["mo", "default"]),
  z: fixed(["mo", "default"]),
  "162": (_a, f) => ({ params: [...(f & 3 ? [["mo", "default"] as Tok] : []), ["cr", "1"], ["cg", "0"], ["cb", "0"], ["mbc", "0.01"]] }),
  "181": fixed(["te", "300"], ["np", "100"], ["nv", "120"], ["wa", "0.4"], ["co", "0.4"]),
  "370": fixed(["me", "0"], ["sc", "0"]),
  p: fixed(["me", "0"], ["sc", "0"], ["re", "0"]),
  t: fixed(["pn", "1"], ["vbe", "0"], ["vbc", "0"], ["be", "100"], ["mo", "default"]),
  f: fixed(["vt", "1.5"], ["be", "0.02"]),
  // OpAmpElm reads "ga" whenever present; the text form only with FLAG_GAIN = 8.
  a: (a, f) => ({
    params: [["ma", "15"], ["mi", "-15"], ["gb", "1e6"], { literal: "0" }, { literal: "0" }, ["ga", "100000"]],
    flags: a.ga !== undefined ? f | 8 : f,
  }),
  T: fixed(["in", "4"], ["ra", "1"], ["c0", "0"], ["c1", "0"], ["co", "0.999"]),
  "212": EXPR,
  "213": EXPR,
  "214": EXPR,
  "215": EXPR,
  "179": (_a, f) => ({ params: [...(f & (1 << 13) ? [["hv", "5"] as Tok] : []), ["ga", "1"]] }),
  "157": (_a, f) => ({ params: [...(f & (1 << 13) ? [["hv", "5"] as Tok] : []), ["ba", "7"], ["ex", "0"], ["di", "0"]] }),
  // Only the default most-significant-bit-first order ("bo" absent) lines up with ours.
  "419": (a, f) => (a.bo !== undefined && a.bo !== "0" ? { params: [{ literal: "-1" }] } : { params: [...(f & (1 << 13) ? [["hv", "5"] as Tok] : []), ["bc", "4"], ["dm", "0"]] }),
  "170": fixed(["mi", "20"], ["ma", "4000"], ["mv", "5"], ["sw", "0.1"]),
  "211": fixed(["du", "1"], ["sa", "8000"], ["la", "0"]),
  // TextElm and LabeledNodeElm: the text attribute is already unescaped, so drop FLAG_ESCAPE (4).
  x: (a, f) => ({ params: [["si", "24"], { literal: a.te ?? "" }], flags: f & ~4 }),
  "207": (a, f) => ({ params: [{ literal: a.te ?? "" }], flags: f & ~4 }),
};

const num = (s: string | undefined, fallback: number) => {
  const v = s === undefined ? NaN : Number(s);
  return Number.isFinite(v) ? v : fallback;
};

/** True for text that looks like Falstad's XML format. */
export const isFalstadXml = (text: string): boolean => /^\s*(<\?xml[^>]*>\s*)?<cir[\s>/]/.test(text.replace(/^﻿/, ""));

export function parseFalstadXml(text: string): FalstadCircuit {
  const out: FalstadCircuit = { settings: null, elements: [], scopes: [], sliders: [], hints: [], models: [], errors: [] };
  let root: XmlNode;
  try {
    root = parseXml(text.replace(/^﻿/, ""));
  } catch (e) {
    out.errors.push({ line: (e as { line?: number }).line ?? 1, raw: String((e as Error).message ?? e) });
    return out;
  }
  if (root.tag !== "cir") {
    out.errors.push({ line: root.line, raw: root.raw });
    return out;
  }
  out.settings = readSettings(root.attrs);

  for (const node of root.children) {
    const a = node.attrs;
    switch (node.tag) {
      case "o":
        readScope(node, out);
        continue;
      case "adj":
        out.sliders.push({
          element: num(a.e, -1),
          flags: num(a.log, 0) ? 2 : 0,
          editItem: num(a.ei, 0),
          min: num(a.mn, 1),
          max: num(a.mx, 1000),
          text: a.st ?? "",
          raw: node.raw,
        });
        continue;
      case "h":
        out.hints.push({ type: num(a.t, -1), item1: num(a.i1, 0), item2: num(a.i2, 0) });
        continue;
    }
    if (MODEL_TAGS.has(node.tag)) {
      out.models.push(node.raw);
      continue;
    }
    if (a.x === undefined) continue; // test tags and anything else without a position
    const el = readElement(node);
    if (el) out.elements.push(el);
    else out.errors.push({ line: node.line, raw: node.raw });
  }
  return out;
}

function readSettings(a: Record<string, string>): FalstadSettings {
  // XMLDeserializer: the speed bar is log(10·ic)·24 + 61.5 from the iteration count "ic".
  const ic = num(a.ic, 0);
  const s: FalstadSettings = {
    flags: num(a.f, 0) | 0,
    timeStep: num(a.ts, 5e-6),
    speed: ic > 0 ? Math.floor(Math.log(10 * ic) * 24 + 61.5) : 117,
    currentSpeed: num(a.cb, 50),
    voltageRange: num(a.vr, 5),
  };
  if (a.pb !== undefined) s.powerBar = num(a.pb, 50);
  if (a.mts !== undefined) s.minTimeStep = num(a.mts, 1e-12);
  return s;
}

function readElement(node: XmlNode): FalstadElement | null {
  const xy = node.attrs.x.trim().split(/\s+/).map(Number);
  if (xy.length < 4 || xy.slice(0, 4).some((v) => !Number.isInteger(v))) return null;
  const code = XML_TAGS[node.tag] ?? node.tag;
  let flags = num(node.attrs.f, 0) | 0;
  let params: string[] = [];
  const template = XML_PARAMS[code];
  if (template) {
    const t = template(node.attrs, flags);
    if (t.flags !== undefined) flags = t.flags;
    params = t.params.map((tok) => ("literal" in tok ? tok.literal : (node.attrs[tok[0]] ?? tok[1])));
  }
  const el: FalstadElement = { code, x1: xy[0], y1: xy[1], x2: xy[2], y2: xy[3], flags, params, raw: node.raw, line: node.line };
  if (node.tag === "rw") {
    const route = node.text
      .split(";")
      .map((pair) => pair.split(",").map((v) => Number(v.trim())))
      .filter((p): p is [number, number] => p.length === 2 && p.every(Number.isFinite));
    if (route.length >= 2) el.route = route;
  }
  return el;
}

// Scope: element "en", speed "sp", flags "f" (hex with an "x" prefix), and the first plot's value "v".
function readScope(node: XmlNode, out: FalstadCircuit): void {
  const a = node.attrs;
  const element = num(a.en, -1);
  if (element < 0) return;
  const f = a.f ?? "0";
  const flags = f.startsWith("x") ? parseInt(f.slice(1), 16) : parseInt(f, 10);
  const plot = node.children.find((c) => c.tag === "p");
  out.scopes.push({ element, speed: num(a.sp, 64), value: num(plot?.attrs.v, 0), flags: flags || 0, raw: node.raw });
}
