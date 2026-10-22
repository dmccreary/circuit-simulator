// CircuitDocument -> Falstad text (FIL-19/FIL-20 round trip). The inverse of
// FALSTAD_PARTS: each part becomes one element line in the token order of the
// element's StringTokenizer constructor in CircuitJS1. A candidate line is kept
// only when importing it puts the part back where it was (same position,
// rotation, mirroring and length), so drawings survive the round trip; parts
// with no Falstad equivalent are listed in the report instead.
// https://github.com/pfalstad/circuitjs1/tree/master/src/com/lushprojects/circuitjs1/client

import type { CircuitDocument, Part, Point, PropValue } from "@cs/model";
import { mapFalstadCircuit } from "./mapper";
import { PLACEHOLDER_TYPE } from "./mapping";
import { escapeFalstad, parseFalstadText } from "./text";

export interface FalstadExportReport {
  /** Parts that could not be written, by id. */
  skipped: { part: string; type: string }[];
}

const PX = 16;
type Num = number | string;

const n = (p: Part, key: string, fallback: number): number => {
  const v = p.props[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
};
const b = (p: Part, key: string): boolean => p.props[key] === true;
const s = (p: Part, key: string, fallback: string): string => {
  const v: PropValue | undefined = p.props[key];
  return typeof v === "string" ? v : fallback;
};

/** Part frame -> document grid (mirror y, rotate clockwise, translate), as @cs/elements localToDocument. */
function toDoc(part: Part, x: number, y: number): Point {
  const y0 = part.orientation.flip ? -y : y;
  const r = part.orientation.rot;
  const [dx, dy] = r === 90 ? [-y0, x] : r === 180 ? [-x, -y0] : r === 270 ? [y0, -x] : [x, y0];
  return { x: part.at.x + dx, y: part.at.y + dy };
}

const px = (p: Point): [number, number] => [p.x * PX, p.y * PX];

/** One element line: code, two points (grid units), flags, tokens. */
function line(code: string, a: Point, z: Point, flags: number, ...tokens: Num[]): string {
  return [code, ...px(a), ...px(z), flags, ...tokens].join(" ");
}

const RAD = Math.PI / 180;
const LED_RGB: Record<string, [number, number, number]> = {
  red: [1, 0, 0],
  green: [0, 1, 0],
  blue: [0, 0, 1],
  yellow: [1, 1, 0],
  orange: [1, 0.5, 0],
  white: [1, 1, 1],
};
const WAVE_CODE: Record<string, number> = { dc: 0, ac: 1, square: 2, triangle: 3, sawtooth: 4, pulse: 5, noise: 6 };

/** Candidate lines for one part; the first that re-imports to the same placement wins. */
function candidates(part: Part): string[] {
  const L = part.length ?? 0;
  const P = part.at;
  const Q = (len = L) => toDoc(part, len, 0);
  const t = part.type;
  switch (t) {
    case "ground":
      return [line("g", P, Q(1), 0, 0)];
    case "resistor":
      return [line("r", P, Q(), 0, n(part, "resistance", 1000))];
    case "capacitor":
      return [line("c", P, Q(), 0, n(part, "capacitance", 1e-5), part.savedState?.[0] ?? 0, n(part, "initialVoltage", 0))];
    case "inductor":
      return [line("l", P, Q(), 0, n(part, "inductance", 1), part.savedState?.[0] ?? 0, n(part, "initialCurrent", 0))];
    case "battery":
    case "dc-source":
      return [line("v", Q(), P, t === "dc-source" ? 8 : 0, 0, 40, n(part, "voltage", 5), 0, 0, 0.5)];
    case "ac-source":
      return [line("v", Q(), P, 0, 1, n(part, "frequency", 60), n(part, "amplitude", 5), n(part, "offset", 0), n(part, "phase", 0) * RAD, 0.5)];
    case "square-source":
      return [
        line("v", Q(), P, 0, 2, n(part, "frequency", 1000), n(part, "amplitude", 5), n(part, "offset", 0), n(part, "phase", 0) * RAD, n(part, "dutyCycle", 50) / 100),
      ];
    case "waveform-source": {
      const wf = WAVE_CODE[s(part, "waveform", "triangle")];
      if (wf === undefined) return [];
      return [
        line("v", Q(), P, 0, wf, n(part, "frequency", 40), n(part, "voltage", 5), n(part, "offset", 0), n(part, "phase", 0) * RAD, n(part, "dutyCycle", 50) / 100),
      ];
    }
    case "rail": {
      const w = s(part, "waveform", "dc");
      if (w === "sweep") {
        return [line("170", P, Q(), b(part, "logSweep") ? 1 : 0, n(part, "frequency", 20), n(part, "maxFrequency", 4000), n(part, "voltage", 5), n(part, "sweepTime", 0.1))];
      }
      const wf = WAVE_CODE[w];
      if (wf === undefined) return [];
      return [line("R", P, Q(), 0, wf, n(part, "frequency", 40), n(part, "voltage", 5), n(part, "offset", 0), n(part, "phase", 0) * RAD, n(part, "dutyCycle", 50) / 100)];
    }
    case "voltage-readout":
      return [line("O", P, Q(), 0, 0)];
    case "current-source":
      return [line("i", P, Q(), 0, n(part, "current", 0.01), 0)];
    case "switch":
      return [line("s", P, Q(), 0, b(part, "closed") ? 0 : 1, "false")];
    case "push-button":
      return [line("s", P, Q(), 0, b(part, "pressed") ? 0 : 1, "true")];
    case "spdt-switch":
      return [line("S", P, Q(), 0, b(part, "thrown") ? 1 : 0, b(part, "momentary") ? "true" : "false", 0, 2)];
    case "diode":
      return [line("d", P, Q(), 2, "default")];
    case "zener-diode":
      return [line("z", P, Q(), 0, n(part, "zenerVoltage", 5.6))];
    case "led": {
      const [r, g, bl] = LED_RGB[s(part, "color", "red")] ?? LED_RGB.red;
      return [line("162", P, Q(), 0, r, g, bl, n(part, "fullBrightnessCurrent", 0.01))];
    }
    case "lamp":
      return [line("181", P, Q(), 0, 300, n(part, "ratedPower", 100), n(part, "ratedVoltage", 120), 0.4, 0.4)];
    case "voltmeter":
      return [line("p", P, Q(), 0, 0, 0, 0)];
    case "ammeter":
      return [line("370", P, Q(), 0, 0, 0)];
    case "memristor":
      return [
        line("m", P, Q(), 0, n(part, "onResistance", 100), n(part, "offResistance", 16000), n(part, "initialWidth", 0), n(part, "totalWidth", 1e-8), n(part, "mobility", 1e-10)),
      ];
    case "npn-transistor":
    case "pnp-transistor":
      return [0, 1].map((f) => line("t", P, Q(), f, t === "pnp-transistor" ? -1 : 1, 0, 0, n(part, "beta", 100), "default"));
    case "n-mosfet":
    case "p-mosfet": {
      const pmos = t === "p-mosfet" ? 1 : 0;
      return [0, 8].map((f) => line("f", P, Q(), f | pmos, n(part, "threshold", 1.5), n(part, "beta", 0.02)));
    }
    case "op-amp": {
      // Falstad's points are on the axis midway between the inputs; FLAG_SWAP = 1 puts "+" first.
      const a = toDoc(part, 0, 1);
      const z = toDoc(part, L, 1);
      const tok = [n(part, "maxOutput", 15), n(part, "minOutput", -15), 1e6, 0, 0, n(part, "gain", 100000)];
      return [8, 9].map((f) => line("a", a, z, f, ...tok));
    }
    case "potentiometer":
      return potCandidates(part);
    case "transformer": {
      // TransformerElm: point2 is the secondary's first post; FLAG_VERTICAL = 8 and FLAG_FLIP = 16
      // pick the side of the second posts, FLAG_REVERSE = 4 the secondary's polarity.
      const rev = b(part, "reversePolarity") ? 4 : 0;
      const tok = [n(part, "inductance", 4), n(part, "ratio", 1), part.savedState?.[0] ?? 0, part.savedState?.[1] ?? 0, n(part, "coupling", 0.999)];
      return [0, 8, 16, 24].map((f) => line("T", P, toDoc(part, 5, 0), f | rev, ...tok));
    }
    case "logic-input":
      // Our symbol sits behind the terminal: Falstad's label point is one lead length the other way.
      return [line("L", P, toDoc(part, -2, 0), 0, b(part, "high") ? 1 : 0, "false", n(part, "supply", 5), 0)];
    case "logic-output":
      return [line("M", P, toDoc(part, 2, 0), 0, 2.5)];
    case "not-gate":
      return [line("I", P, Q(), 0, 0.5, n(part, "supply", 5))];
    default:
      return gateCandidates(part) ?? chipCandidates(part) ?? [];
  }
}

const GATE_CODES: Record<string, string> = { "and-gate": "150", "nand-gate": "151", "or-gate": "152", "nor-gate": "153", "xor-gate": "154" };

function gateCandidates(part: Part): string[] | null {
  const m = /^(and|nand|or|nor|xor)-gate(?:-(\d))?$/.exec(part.type);
  if (!m) return null;
  const inputs = m[2] ? Number(m[2]) : 2;
  const axis = Math.floor(inputs / 2);
  const L = part.length ?? 4;
  const a = toDoc(part, 0, axis);
  const z = toDoc(part, L, axis);
  const flags = part.props.schmitt === true ? 2 : 0;
  return [line(GATE_CODES[`${m[1]}-gate`], a, z, flags, inputs, 0, n(part, "supply", 5))];
}

/** Chip-shaped parts, written only in their unrotated, unmirrored form. */
function chipCandidates(part: Part): string[] | null {
  const P = part.at;
  const at = (dx: number, dy: number): Point => ({ x: P.x + dx, y: P.y + dy });
  switch (part.type) {
    case "d-flip-flop":
      return [line("155", P, at(1, 0), 0, 0)];
    case "jk-flip-flop":
      return [line("156", P, at(1, 0), 4, 0)];
    case "timer-555":
      return [line("165", at(0, -2), at(1, -2), 4, 0)];
    case "current-conveyor":
      return [line("179", P, at(1, 0), 0, n(part, "gain", 1))];
    case "expression-source":
      return [line(EXPR_CODES[s(part, "kind", "vcvs")] ?? "212", P, at(1, 0), 0, n(part, "inputs", 2), escapeFalstad(s(part, "expression", "0")))];
    case "seven-segment":
      return [line("157", P, at(1, 0), 0, 7, 0, 0)];
    case "number-display":
      return [line("419", P, at(1, 0), 0, n(part, "bits", 4), Math.max(0, ["decimal", "hex", "octal"].indexOf(s(part, "mode", "decimal"))))];
    case "transmission-line":
      return [line("171", P, toDoc(part, part.length ?? 8, 0), 0, n(part, "delay", 1e-8), n(part, "impedance", 75), 64, 0)];
    case "analog-switch":
    case "analog-switch-2": {
      const code = part.type === "analog-switch" ? "159" : "160";
      const tok = [n(part, "onResistance", 20), n(part, "offResistance", 1e10), n(part, "threshold", 2.5)];
      const base = (b(part, "invert") ? 1 : 0) | (b(part, "pulldown") ? 2 : 0);
      return [base, base | 16].map((f) => line(code, part.at, toDoc(part, part.length ?? 4, 0), f, ...tok));
    }
    default: {
      const m = /^relay(?:-(\d))?$/.exec(part.type);
      if (!m) return null;
      const poles = m[1] ? Number(m[1]) : 1;
      const tok = [
        poles, n(part, "coilInductance", 0.2), 0, n(part, "onResistance", 0.05), n(part, "offResistance", 1e6),
        n(part, "onCurrent", 0.02), n(part, "coilResistance", 20), n(part, "offCurrent", 0.015), n(part, "switchingTime", 0.005), 0,
      ];
      return [4 | 2, 4 | 2 | 8].map((f) => line("178", part.at, toDoc(part, part.length ?? 4, 0), f, ...tok));
    }
  }
}

const EXPR_CODES: Record<string, string> = { vcvs: "212", vccs: "213", ccvs: "214", cccs: "215" };

/** PotElm keeps point2 on the longer axis and the wiper offset in the shorter component. */
function potCandidates(part: Part): string[] {
  const L = part.length ?? 4;
  const P = part.at;
  const Q = toDoc(part, L, 0);
  const W = toDoc(part, Math.floor(L / 2), -2);
  const ux = Math.sign(Q.x - P.x);
  const uy = Math.sign(Q.y - P.y);
  const mid = { x: (P.x + Q.x) / 2, y: (P.y + Q.y) / 2 };
  const offset = ((W.x - mid.x) * uy - (W.y - mid.y) * ux) * PX; // along (uy, -ux)
  const tok = [n(part, "resistance", 1000), n(part, "position", 0.5), "Resistance"];
  const [x1, y1] = px(P);
  const [x2, y2] = px(Q);
  const out: string[] = [];
  for (const flip of [0, 2]) {
    let mx = 0;
    let my = 0;
    if (ux !== 0) my = ux < 0 ? offset : -offset;
    else mx = uy > 0 ? offset : -offset;
    out.push(["174", x1, y1, x2 + mx, y2 + my, flip, ...tok].join(" "));
  }
  return out;
}

/**
 * A placeholder's original text line, rescaled to 16 pixels per grid unit
 * (circuits read on an 8-pixel grid were halved on import). XML elements have
 * no text line and are not written.
 */
function placeholderLine(part: Part, raw: string): string | null {
  const tok = raw.trim().split(/\s+/);
  if (tok.length < 6 || raw.trimStart().startsWith("<")) return null;
  const xy = tok.slice(1, 5).map(Number);
  if (xy.some((v) => !Number.isInteger(v))) return null;
  // Our part sits at point1 (or point2 for parts drawn from their second point): find the scale.
  const scale =
    part.at.x !== 0 && xy[0] !== 0 ? xy[0] / part.at.x : part.at.y !== 0 && xy[1] !== 0 ? xy[1] / part.at.y : PX;
  const f = scale === 8 ? 2 : 1;
  return [tok[0], ...xy.map((v) => v * f), ...tok.slice(5)].join(" ");
}

/** Same placement after a re-import (gates: inputs are interchangeable, so mirroring is ignored). */
function samePlace(a: Part, b: Part): boolean {
  if (a.type !== b.type || a.at.x !== b.at.x || a.at.y !== b.at.y || a.orientation.rot !== b.orientation.rot) return false;
  if ((a.length ?? 0) !== (b.length ?? 0) && a.length !== undefined && b.length !== undefined) return false;
  if (/-gate(-\d)?$/.test(a.type) && a.type !== "not-gate") return true;
  return a.orientation.flip === b.orientation.flip;
}

function reimport(lineText: string): Part | undefined {
  const fc = parseFalstadText(lineText);
  if (fc.elements.length !== 1) return undefined;
  const { doc } = mapFalstadCircuit(fc);
  return Object.values(doc.parts)[0];
}

/** Falstad text for a document, and the parts it could not write. */
export function exportFalstad(doc: CircuitDocument): { text: string; report: FalstadExportReport } {
  const report: FalstadExportReport = { skipped: [] };
  const lines: string[] = [];
  const index = new Map<string, number>();
  const settings = "$ 1 0.000005 10.20027730826997 50 5 50 5e-11";
  for (const part of Object.values(doc.parts)) {
    if (part.type === PLACEHOLDER_TYPE) {
      const raw = typeof part.props.falstadLine === "string" ? placeholderLine(part, part.props.falstadLine) : null;
      if (raw === null) {
        report.skipped.push({ part: part.id, type: part.type });
        continue;
      }
      index.set(part.id, lines.length);
      lines.push(raw);
      continue;
    }
    const found = candidates(part).find((c) => {
      const back = reimport(c);
      return back !== undefined && samePlace(part, back);
    });
    if (!found) {
      report.skipped.push({ part: part.id, type: part.type });
      continue;
    }
    index.set(part.id, lines.length);
    lines.push(found);
  }
  for (const w of Object.values(doc.wires)) {
    for (let k = 1; k < w.points.length; k++) lines.push(line("w", w.points[k - 1], w.points[k], 0));
  }
  for (const label of Object.values(doc.netLabels)) {
    // LabeledNodeElm: the post is point1; the name is drawn at point2, two squares to the right.
    lines.push(line("207", label.at, { x: label.at.x + 2, y: label.at.y }, 4, escapeFalstad(label.name)));
  }
  for (const a of Object.values(doc.annotations)) {
    if (a.kind === "text" && a.text) lines.push(line("x", a.at, { x: a.at.x + 1, y: a.at.y }, 4, 24, escapeFalstad(a.text)));
  }
  // Scopes: Falstad's value codes 0 voltage, 3 current, 7 power, on the probed part.
  Object.values(doc.probes).forEach((p, k) => {
    const part = "part" in p.target ? p.target.part : undefined;
    const i = part !== undefined ? index.get(part) : undefined;
    if (i === undefined) return;
    const value = p.quantity === "current" ? 3 : p.quantity === "power" ? 7 : 0;
    lines.push(`o ${i} 64 ${value} 4098 5 0.05 ${k}`);
  });
  return { text: [settings, ...lines].join("\n") + "\n", report };
}
