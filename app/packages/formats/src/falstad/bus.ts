// Buses (CircuitJS1 bit order "bus", XML files only): a chip's multi-bit pin
// has all its bits on one post, and a wire or labeled node touching such a
// post carries one net per bit. Our documents have no multi-bit wires, so the
// importer expands them into ordinary nets:
//
// - bus widths are found as SimulationManager.detectBusWidths() does: from the
//   bus posts, through wires and same-named labeled nodes, until stable;
// - bus wires and bus labels are dropped (turned into zero-length wires, so
//   element indexes, which scopes and sliders refer to, do not move);
// - every bus net gets a name, from one of its labels when it has one, and
//   bit z of each bus port gets a net label "name[z]" on the terminal that
//   carries that bit: our bus parts put bit z z grid units out from the post
//   (chip-kit busPins, BusLogicInputElm, InstructionDisplayElm); a bus
//   splitter (BusSplitterElm) becomes just the labels on its single-bit posts.
//
// Sources: SimulationManager.java (detectBusWidths, calculateWireClosure),
// WireElm, LabeledNodeElm, BusSplitterElm, BusLogicInputElm,
// InstructionDisplayElm, ChipElm.makeBitPins, MultiplexerElm, Counter2Elm,
// FullAdderElm and ROMElm in
// https://github.com/pfalstad/circuitjs1/tree/master/src/com/lushprojects/circuitjs1/client

import { XML_BIT_ORDER_SHIFT, XML_MODE_SHIFT } from "./mapping-chips";
import { unescapeFalstad, type FalstadCircuit, type FalstadElement } from "./text";

type Pt = [number, number];

interface Port {
  post: Pt;
  width: number;
  /** Where bit z's net label goes. */
  bits: Pt[];
}

const FLIP_X = 1 << 10;
const FLIP_Y = 1 << 11;
const FLIP_XY = 1 << 12;
const BUS = 2;

const key = (p: Pt) => `${p[0]},${p[1]}`;
const intAttr = (el: FalstadElement, i: number, fallback: number) => {
  const v = Number(el.params[i]);
  return el.params[i] === undefined || !Number.isFinite(v) ? fallback : v;
};

/** ChipElm post positions in pixels from pin-spacing coordinates, flips applied (FLAG_FLIP_XY first). */
function chipT(el: FalstadElement, sizeX: number, sizeY: number) {
  const c = el.flags & 1 ? 16 : 32;
  const xy = (el.flags & FLIP_XY) !== 0;
  const fsx = xy ? sizeY : sizeX;
  const fsy = xy ? sizeX : sizeY;
  return (sx: number, sy: number): Pt => {
    let X = el.x1 + c * sx;
    let Y = el.y1 + c * sy;
    if (xy) {
      X = el.x1 + c + c * sy;
      Y = el.y1 - c + c * sx;
    }
    if (el.flags & FLIP_X) X = 2 * el.x1 + c * (fsx + 1) - X;
    if (el.flags & FLIP_Y) Y = 2 * el.y1 + c * (fsy - 1) - Y;
    return [X, Y];
  };
}

/**
 * A chip bus pin with its post at `slot` (pin spacings); bit z's terminal at
 * at(z), in grid units of the chip frame (two per spacing), as the bus-form
 * specs in @cs/elements place them (counter, full-adder, rom, multiplexer descriptor.ts).
 */
function chipPort(T: (sx: number, sy: number) => Pt, slot: Pt, width: number, at: (z: number) => Pt): Port {
  return {
    post: T(slot[0], slot[1]),
    width,
    bits: Array.from({ length: width }, (_, z) => {
      const [gx, gy] = at(z);
      return T(gx / 2, gy / 2);
    }),
  };
}

const column = (x: number, y0: number) => (z: number): Pt => [x, y0 + z];
const block = (x: number, y: number) => (z: number): Pt => [x + (z % 2), y + Math.floor(z / 2)];

/** Bus ports of an element, or [] (also when the element's own rule will not map it). */
function portsOf(el: FalstadElement, unit: number): Port[] {
  const bo = (el.flags >> XML_BIT_ORDER_SHIFT) & 3;
  const mode = (el.flags >> XML_MODE_SHIFT) & 3;
  const k = el.flags & (1 << 13) ? 1 : 0; // FLAG_CUSTOM_VOLTAGE adds a token
  switch (el.code) {
    case "421": {
      if (bo !== BUS) return [];
      const b = intAttr(el, 0, 4);
      const T = chipT(el, 2, 4);
      return [chipPort(T, [3, 1], b, column(4, 1)), chipPort(T, [0, 1], b, column(2, 1))];
    }
    case "196": {
      if (bo !== BUS || !(el.flags & 2)) return [];
      const b = intAttr(el, 0, 4);
      const T = chipT(el, 2, 3);
      return [chipPort(T, [0, 0], b, block(2, 0)), chipPort(T, [0, 1], b, block(2, 2)), chipPort(T, [3, 2], b, column(4, 1))];
    }
    case "436": {
      if (bo !== BUS) return [];
      const T = chipT(el, 2, 2);
      return [
        chipPort(T, [0, 1], intAttr(el, k, 4), column(2, 0)),
        chipPort(T, [3, 1], intAttr(el, k + 1, 4), (z) => [z < 4 ? 4 : 3, z % 4]),
      ];
    }
    case "184": {
      if (mode !== 2) return [];
      const sel = intAttr(el, k, 2);
      const w = intAttr(el, k + 1, 4);
      const n = 1 << sel;
      const T = chipT(el, sel + 1, n + 1);
      const ports = Array.from({ length: n }, (_, g) => chipPort(T, [0, g], w, block(2, 2 * g)));
      return [...ports, chipPort(T, [sel + 2, 0], w, block(2 * sel + 1, 0))];
    }
    case "433": {
      // BusSplitterElm: the bus at W0, bit z on its own post at E(bits-1-z).
      const b = intAttr(el, 0, 4);
      const T = chipT(el, 2, b);
      return [{ post: T(0, 0), width: b, bits: Array.from({ length: b }, (_, z) => T(3, b - 1 - z)) }];
    }
    case "bli":
    case "ins": {
      // Bus post at point1; bit z z grid units along the body toward point2.
      const dx = el.x2 - el.x1;
      const dy = el.y2 - el.y1;
      if ((dx !== 0) === (dy !== 0)) return [];
      const ux = Math.sign(dx) * unit;
      const uy = Math.sign(dy) * unit;
      const w = intAttr(el, 0, 4);
      return [{ post: [el.x1, el.y1], width: w, bits: Array.from({ length: w }, (_, z) => [el.x1 + ux * z, el.y1 + uy * z] as Pt) }];
    }
  }
  return [];
}

const labelText = (el: FalstadElement) => (el.flags & 4 ? unescapeFalstad(el.params[0] ?? "") : el.params.join(" "));

/** Expand buses into single-bit nets (see the header). Circuits without bus ports come back unchanged. */
export function expandBuses(fc: FalstadCircuit, unit: number): FalstadCircuit {
  const ports = fc.elements.map((el) => portsOf(el, unit));
  if (!ports.some((p) => p.length)) return fc;

  // detectBusWidths: post widths, then wires and labels until stable.
  const width = new Map<string, number>();
  const widen = (k: string, w: number) => {
    if ((width.get(k) ?? 1) >= w) return false;
    width.set(k, w);
    return true;
  };
  for (const list of ports) for (const p of list) widen(key(p.post), p.width);
  const labelWidth = new Map<string, number>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const el of fc.elements) {
      const a = key([el.x1, el.y1]);
      if (el.code === "w") {
        const w = Math.max(width.get(a) ?? 1, width.get(key([el.x2, el.y2])) ?? 1);
        if (w > 1) changed = widen(a, w) || widen(key([el.x2, el.y2]), w) || changed;
      } else if (el.code === "207") {
        const t = labelText(el);
        const w = Math.max(width.get(a) ?? 1, labelWidth.get(t) ?? 1);
        if (w > 1) {
          changed = widen(a, w) || changed;
          if ((labelWidth.get(t) ?? 1) < w) {
            labelWidth.set(t, w);
            changed = true;
          }
        }
      }
    }
  }

  // Bus nets: union-find over points, wire ends and label names.
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(k, r);
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  const dropped = new Set<number>();
  const names = new Map<string, string>();
  fc.elements.forEach((el, i) => {
    const a = key([el.x1, el.y1]);
    if (el.code === "w" && (width.get(a) ?? 1) > 1) {
      union(a, key([el.x2, el.y2]));
      dropped.add(i);
    } else if (el.code === "207" && (width.get(a) ?? 1) > 1) {
      const t = labelText(el);
      union(a, `label:${t}`);
      names.set(`label:${t}`, t);
      dropped.add(i);
    } else if (el.code === "433" && ports[i].length) dropped.add(i);
  });
  const groupName = new Map<string, string>();
  for (const [k, t] of names) if (!groupName.has(find(k))) groupName.set(find(k), t);
  let n = 0;
  const nameOf = (post: Pt) => {
    const r = find(key(post));
    if (!groupName.has(r)) groupName.set(r, `bus${++n}`);
    return groupName.get(r)!;
  };

  const elements = fc.elements.map((el, i) =>
    dropped.has(i) ? { ...el, code: "w", x2: el.x1, y2: el.y1, params: [], route: undefined } : el,
  );
  for (const list of ports) {
    for (const p of list) {
      const name = nameOf(p.post);
      p.bits.forEach(([x, y], z) => {
        elements.push({ code: "207", x1: x, y1: y, x2: x, y2: y, flags: 0, params: [`${name}[${z}]`], raw: "", line: 0 });
      });
    }
  }
  return { ...fc, elements };
}
