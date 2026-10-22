// Parser for Falstad's text circuit format into the neutral FalstadCircuit.
// Line handling follows CircuitLoader.readCircuit():
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/CircuitLoader.java
// The common prefix "type x1 y1 x2 y2 flags" is CircuitElm.dump():
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/CircuitElm.java

export interface FalstadSettings {
  flags: number; // bit 1 dots, 2 small grid, 4 hide volts, 8 power, 16 hide values, 64 adjust step, 128 DC on reset
  timeStep: number;
  speed: number;
  currentSpeed: number;
  voltageRange: number;
  powerBar?: number;
  minTimeStep?: number;
}

export interface FalstadElement {
  /** Type as Falstad writes it: a character ("r") below code 127, else the number ("162"). */
  code: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  flags: number;
  /** Remaining tokens, still as text. */
  params: string[];
  raw: string;
  line: number; // 1-based
  /** Wire route through intermediate points, Falstad pixels, end points included (XML RoutedWireElm). */
  route?: [number, number][];
}

export interface FalstadScope {
  element: number; // index into elements
  speed: number;
  value: number; // 0 voltage, 3 current, 7 power
  flags: number;
  raw: string;
}

export interface FalstadSlider {
  element: number;
  flags: number; // 1 shared, 2 logarithmic
  editItem: number;
  min: number;
  max: number;
  text: string;
  raw: string;
}

export interface FalstadHint {
  type: number; // 1 LC, 2 RC, 3 3dB (C), 4 twin-T, 5 3dB (L)
  item1: number;
  item2: number;
}

export interface FalstadCircuit {
  settings: FalstadSettings | null;
  elements: FalstadElement[];
  scopes: FalstadScope[];
  sliders: FalstadSlider[];
  hints: FalstadHint[];
  /** Model and subcircuit definitions (`!`, `34`, `32`, `.`), kept raw. */
  models: string[];
  /** Lines that could not be read. */
  errors: { line: number; raw: string }[];
}

// CircuitLoader splits on " +\t\n\r\f": a "+" separates tokens too.
const SEP = /[ +\t\n\r\f]+/;

const typeCode = (token: string): string => {
  const c = token.charAt(0);
  if (c >= "0" && c <= "9") {
    const n = parseInt(token, 10);
    return n < 127 ? String.fromCharCode(n) : String(n);
  }
  return c;
};

export function parseFalstadText(text: string): FalstadCircuit {
  const out: FalstadCircuit = { settings: null, elements: [], scopes: [], sliders: [], hints: [], models: [], errors: [] };
  const lines = text.split(/\r\n|\r|\n/);
  lines.forEach((raw, i) => {
    const tokens = raw.split(SEP).filter((t) => t.length > 0);
    if (tokens.length === 0) return;
    const line = i + 1;
    const code = typeCode(tokens[0]);
    const rest = tokens.slice(1);
    const num = (k: number) => Number(rest[k]);
    try {
      switch (code) {
        case "$":
          out.settings = {
            flags: num(0) | 0,
            timeStep: num(1),
            speed: num(2),
            currentSpeed: num(3),
            voltageRange: num(4),
            ...(rest.length > 5 ? { powerBar: num(5) } : {}),
            ...(rest.length > 6 ? { minTimeStep: num(6) } : {}),
          };
          return;
        case "o":
          out.scopes.push({ element: num(0), speed: num(1), value: num(2), flags: parseIntLoose(rest[3]), raw });
          return;
        case "h":
          out.hints.push({ type: num(0), item1: num(1), item2: num(2) });
          return;
        case "&": // also written as "38"
          out.sliders.push(parseSlider(rest, raw));
          return;
        case "!":
        case "\"": // 34: diode model
        case " ": // 32: transistor model
        case ".":
          out.models.push(raw);
          return;
        case "%":
        case "?":
        case "B":
          return; // filter-specific lines CircuitJS1 ignores too
      }
      if (rest.length < 5 || rest.slice(0, 5).some((t) => !/^-?\d+$/.test(t))) {
        out.errors.push({ line, raw });
        return;
      }
      out.elements.push({
        code,
        x1: num(0),
        y1: num(1),
        x2: num(2),
        y2: num(3),
        flags: num(4) | 0,
        params: rest.slice(5),
        raw,
        line,
      });
    } catch {
      out.errors.push({ line, raw });
    }
  });
  return out;
}

// Scope flags may be written in hex with a "x" prefix (ScopeSerializer.importDecOrHex).
function parseIntLoose(s: string | undefined): number {
  if (!s) return 0;
  return s.startsWith("x") ? parseInt(s.slice(1), 16) : parseInt(s, 10);
}

// Adjustable(StringTokenizer): https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/Adjustable.java
function parseSlider(rest: string[], raw: string): FalstadSlider {
  let k = 0;
  const element = Number(rest[k++]);
  let flags = 0;
  let ei = rest[k++] ?? "0";
  if (ei.startsWith("F")) {
    flags = parseInt(ei.slice(1), 10);
    ei = rest[k++] ?? "0";
  }
  const editItem = parseInt(ei, 10);
  const min = Number(rest[k++]);
  const max = Number(rest[k++]);
  if (flags & 1) k++; // shared-slider index
  const text = unescapeFalstad(rest[k++] ?? "");
  return { element, flags, editItem, min, max, text, raw };
}

/** CustomLogicModel.escape(): the inverse of unescapeFalstad, so a token never holds a space. */
export function escapeFalstad(s: string): string {
  if (s === "") return "\\0";
  return s.replace(/[\\\n\r +=#&]/g, (c) => ({ "\\": "\\\\", "\n": "\\n", "\r": "\\r", " ": "\\s", "+": "\\p", "=": "\\q", "#": "\\h", "&": "\\a" })[c] ?? c);
}

/** CustomLogicModel.unescape(). */
export function unescapeFalstad(s: string): string {
  if (s === "\\0") return "";
  const map: Record<string, string> = { n: "\n", r: "\r", s: " ", p: "+", q: "=", h: "#", a: "&", "\\": "\\" };
  return s.replace(/\\(.)/g, (m, c: string) => map[c] ?? m);
}
