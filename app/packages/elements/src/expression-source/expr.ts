// Expressions for controlled sources, ported from CircuitJS1's Expr and
// ExprParser (same grammar, precedence, functions, and variables):
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/Expr.java
// Variables: a..i (inputs), t, timestep, lastoutput, pi, lasta..lasti, dadt..didt.
// Pure: no DOM, no engine imports.

export interface ExprState {
  /** Input values a..i (index 0..8). */
  values: Float64Array;
  /** Values at the last accepted step. */
  lastValues: Float64Array;
  lastOutput: number;
  t: number;
  timestep: number;
}

export type CompiledExpr = (s: ExprState) => number;

export class ExprError extends Error {}

export function newExprState(): ExprState {
  const values = new Float64Array(9);
  values[4] = Math.E; // CircuitJS1 seeds "e" with Euler's number
  return { values, lastValues: new Float64Array(9), lastOutput: 0, t: 0, timestep: 0 };
}

const posmod = (x: number, y: number) => {
  const r = x % y;
  return r >= 0 ? r : r + y;
};

const F1: Record<string, (x: number) => number> = {
  sin: Math.sin, cos: Math.cos, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, abs: Math.abs, exp: Math.exp,
  log: Math.log, sqrt: Math.sqrt, tan: Math.tan, floor: Math.floor, ceil: Math.ceil,
  tri: (x) => {
    const u = posmod(x, Math.PI * 2) / Math.PI;
    return u < 1 ? -1 + u * 2 : 3 - u * 2;
  },
  saw: (x) => posmod(x, Math.PI * 2) / Math.PI - 1,
};

/** Name -> [min args, max args]. */
const FN: Record<string, [number, number]> = {
  min: [2, 1000], max: [2, 1000], pwl: [2, 1000], mod: [2, 2], step: [1, 2],
  select: [3, 3], clamp: [3, 3], pwr: [2, 2], pwrs: [2, 2],
};

function pwl(x: number, a: number[]): number {
  let [x0, y0] = [a[0], a[1]];
  if (x < x0) return y0;
  let [x1, y1] = [a[2], a[3]];
  let i = 4;
  for (;;) {
    if (x < x1) return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
    if (i + 1 >= a.length) break;
    [x0, y0, x1, y1] = [x1, y1, a[i], a[i + 1]];
    i += 2;
  }
  return y1;
}

function multi(name: string, args: CompiledExpr[]): CompiledExpr {
  const ev = (s: ExprState) => args.map((f) => f(s));
  switch (name) {
    case "min":
      return (s) => Math.min(...ev(s));
    case "max":
      return (s) => Math.max(...ev(s));
    case "pwl":
      return (s) => {
        const v = ev(s);
        return v.length >= 5 ? pwl(v[0], v.slice(1)) : v.length >= 3 && v[0] < v[1] ? v[2] : NaN;
      };
    case "mod":
      return (s) => args[0](s) % args[1](s);
    case "step":
      return (s) => {
        const x = args[0](s);
        if (args.length < 2) return x < 0 ? 0 : 1;
        return x > args[1](s) ? 0 : x < 0 ? 0 : 1;
      };
    case "select":
      return (s) => (args[0](s) > 0 ? args[2](s) : args[1](s));
    case "clamp":
      return (s) => Math.min(Math.max(args[0](s), args[1](s)), args[2](s));
    case "pwr":
      return (s) => Math.pow(Math.abs(args[0](s)), args[1](s));
    default: // pwrs
      return (s) => {
        const x = args[0](s);
        const p = args[1](s);
        return x < 0 ? -Math.pow(-x, p) : Math.pow(x, p);
      };
  }
}

/** Tokens as ExprParser.getToken() splits them (text lower-cased, spaces skipped). */
function tokenize(text: string): string[] {
  const out: string[] = [];
  let pos = 0;
  const n = text.length;
  while (pos < n) {
    while (pos < n && text[pos] === " ") pos++;
    if (pos === n) break;
    let i = pos;
    const c = text[i];
    if ((c >= "0" && c <= "9") || c === ".") {
      for (i = pos; i < n; i++) {
        if (text[i] === "e") {
          i++;
          if (i < n && (text[i] === "+" || text[i] === "-")) i++;
        }
        if (!((text[i] >= "0" && text[i] <= "9") || text[i] === ".")) break;
      }
    } else if (c >= "a" && c <= "z") {
      while (i < n && text[i] >= "a" && text[i] <= "z") i++;
    } else {
      i++;
      if (i < n) {
        if (text[i] === c && "|&<>=".includes(c)) i++;
        else if ("<>!".includes(c) && text[i] === "=") i++;
      }
    }
    out.push(text.slice(pos, i));
    pos = i;
  }
  return out;
}

/** Compile an expression; throws ExprError on a syntax error. */
export function compileExpr(source: string): CompiledExpr {
  const toks = tokenize(source.toLowerCase());
  let k = 0;
  const peek = () => toks[k] ?? "";
  const skip = (s: string) => (peek() === s ? (k++, true) : false);
  const expect = (s: string) => {
    if (!skip(s)) throw new ExprError(`expected ${s}, got ${peek() || "end of input"}`);
  };
  const bin = (a: CompiledExpr, b: CompiledExpr, op: (x: number, y: number) => number): CompiledExpr => (s) => op(a(s), b(s));

  const parse = (): CompiledExpr => {
    const e = parseOr();
    if (skip("?")) {
      const e2 = parseOr();
      expect(":");
      const e3 = parse();
      return (s) => (e(s) !== 0 ? e2(s) : e3(s));
    }
    return e;
  };
  const parseOr = (): CompiledExpr => {
    let e = parseAnd();
    while (skip("||")) e = bin(e, parseAnd(), (x, y) => (x !== 0 || y !== 0 ? 1 : 0));
    return e;
  };
  const parseAnd = (): CompiledExpr => {
    let e = parseBitOr();
    while (skip("&&")) e = bin(e, parseBitOr(), (x, y) => (x !== 0 && y !== 0 ? 1 : 0));
    return e;
  };
  const parseBitOr = (): CompiledExpr => {
    let e = parseBitAnd();
    while (skip("|")) e = bin(e, parseBitAnd(), (x, y) => (x | 0) | (y | 0));
    return e;
  };
  const parseBitAnd = (): CompiledExpr => {
    let e = parseEquals();
    while (skip("&")) e = bin(e, parseEquals(), (x, y) => (x | 0) & (y | 0));
    return e;
  };
  const parseEquals = (): CompiledExpr => {
    const e = parseCompare();
    return skip("==") ? bin(e, parseCompare(), (x, y) => (x === y ? 1 : 0)) : e;
  };
  const parseCompare = (): CompiledExpr => {
    const e = parseShift();
    if (skip("<=")) return bin(e, parseShift(), (x, y) => (x <= y ? 1 : 0));
    if (skip(">=")) return bin(e, parseShift(), (x, y) => (x >= y ? 1 : 0));
    if (skip("!=")) return bin(e, parseShift(), (x, y) => (x !== y ? 1 : 0));
    if (skip("<")) return bin(e, parseShift(), (x, y) => (x < y ? 1 : 0));
    if (skip(">")) return bin(e, parseShift(), (x, y) => (x > y ? 1 : 0));
    return e;
  };
  const parseShift = (): CompiledExpr => {
    let e = parseAdd();
    while (skip(">>")) e = bin(e, parseAdd(), (x, y) => (x | 0) >> (y | 0));
    return e;
  };
  const parseAdd = (): CompiledExpr => {
    let e = parseMult();
    for (;;) {
      if (skip("+")) e = bin(e, parseMult(), (x, y) => x + y);
      else if (skip("-")) e = bin(e, parseMult(), (x, y) => x - y);
      else return e;
    }
  };
  const parseMult = (): CompiledExpr => {
    let e = parseUminus();
    for (;;) {
      if (skip("*")) e = bin(e, parseUminus(), (x, y) => x * y);
      else if (skip("/")) e = bin(e, parseUminus(), (x, y) => x / y);
      else return e;
    }
  };
  const parseUminus = (): CompiledExpr => {
    skip("+");
    if (skip("!")) {
      const e = parseUminus();
      return (s) => (e(s) === 0 ? 1 : 0);
    }
    if (skip("-")) {
      const e = parseUminus();
      return (s) => -e(s);
    }
    let e = parseTerm();
    while (skip("^")) e = bin(e, parseTerm(), Math.pow);
    return e;
  };
  const args = (): CompiledExpr[] => {
    expect("(");
    const list = [parse()];
    while (skip(",")) list.push(parse());
    expect(")");
    return list;
  };
  const parseTerm = (): CompiledExpr => {
    if (skip("(")) {
      const e = parse();
      expect(")");
      return e;
    }
    const tok = peek();
    if (skip("t")) return (s) => s.t;
    if (tok.length === 1 && tok >= "a" && tok <= "i") {
      k++;
      const i = tok.charCodeAt(0) - 97;
      return (s) => s.values[i];
    }
    if (tok.length === 5 && tok.startsWith("last") && tok[4] >= "a" && tok[4] <= "i") {
      k++;
      const i = tok.charCodeAt(4) - 97;
      return (s) => s.lastValues[i];
    }
    if (tok.length === 4 && tok[0] === "d" && tok.endsWith("dt") && tok[1] >= "a" && tok[1] <= "i") {
      k++;
      const i = tok.charCodeAt(1) - 97;
      return (s) => (s.timestep > 0 ? (s.values[i] - s.lastValues[i]) / s.timestep : 0);
    }
    if (skip("lastoutput")) return (s) => s.lastOutput;
    if (skip("timestep")) return (s) => s.timestep;
    if (skip("pi")) return () => Math.PI;
    if (Object.prototype.hasOwnProperty.call(F1, tok)) {
      k++;
      const f = F1[tok];
      expect("(");
      const e = parse();
      expect(")");
      return (s) => f(e(s));
    }
    if (Object.prototype.hasOwnProperty.call(FN, tok)) {
      k++;
      const list = args();
      const [lo, hi] = FN[tok];
      if (list.length < lo || list.length > hi) throw new ExprError(`bad number of function args: ${list.length}`);
      return multi(tok, list);
    }
    const v = Number(tok);
    if (tok !== "" && Number.isFinite(v)) {
      k++;
      return () => v;
    }
    throw new ExprError(tok ? `unrecognized token: ${tok}` : "unexpected end of input");
  };

  if (!toks.length) return () => 0;
  const e = parse();
  if (k < toks.length) throw new ExprError(`unexpected token: ${peek()}`);
  return e;
}
