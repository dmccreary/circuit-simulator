// Falstad element variants that our parts match only after some rewiring:
// elements drawn at CircuitJS1's 16-pixel pin spacing in a circuit that uses the
// 8-pixel grid (our pins sit one grid unit apart, so they land at half
// Falstad's spacing), and chips flipped with FLAG_FLIP_X / _Y / _XY.
//
// For the small-grid case our part is placed as a half-scale copy and a "fan"
// of wires joins each Falstad post to the matching pin. Each wire leaves the
// Falstad post straight inward, runs along its own lane parallel to the side,
// and turns in to our pin; lanes are ordered so that no wire end lands on
// another wire (our compiler joins a wire end to any wire it touches), and the
// result is checked before it is used.
//
// Pin positions follow ChipElm.setPoints() / Pin.setPoint(), GateElm,
// OpAmpElm, TransistorElm, MosfetElm, AnalogSwitchElm and AnalogSwitch2Elm in
// https://github.com/pfalstad/circuitjs1/tree/master/src/com/lushprojects/circuitjs1/client

import type { PartMapping } from "./mapping";
import type { FalstadElement } from "./text";

type Rule = (el: FalstadElement, unit: number) => PartMapping | null;
export type Pt = [number, number];

const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + k * b[0], a[1] + k * b[1]];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const same = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1];

export interface FanPin {
  /** Falstad's post. */
  f: Pt;
  /** Our pin. */
  o: Pt;
  /** Unit vector pointing out of the part on this pin's side (axis-aligned). */
  out: Pt;
}

/**
 * Wires joining Falstad posts to our pins, side by side, or null when a side
 * has no room. `innerLane` also allows a lane on our pins' own line, for sides
 * where every pin on that line is wired (transistor and switch ends).
 */
export function fanWires(pins: FanPin[], unit: number, innerLane = false): Pt[][] | null {
  const wires: Pt[][] = [];
  const sides = new Map<string, FanPin[]>();
  for (const p of pins) {
    if (same(p.f, p.o)) continue;
    const key = p.out.join(",");
    sides.set(key, [...(sides.get(key) ?? []), p]);
  }
  for (const group of sides.values()) {
    const w = group[0].out;
    const r: Pt = [-w[1], w[0]];
    const along = (p: Pt) => dot(p, r);
    const depth = (p: Pt) => -dot(p, w);
    const F = depth(group[0].f);
    const O = depth(group[0].o);
    if (group.some((p) => depth(p.f) !== F || depth(p.o) !== O) || O < F) return null;
    const at = (a: number, d: number): Pt => add([a * r[0], a * r[1]], w, -d);
    const laned: { a0: number; a1: number; p: FanPin; lane?: number }[] = [];
    for (const p of group) {
      const a0 = along(p.f);
      const a1 = along(p.o);
      if (a0 === a1) wires.push([p.f, p.o]);
      else laned.push({ a0, a1, p });
    }
    // A wire whose Falstad post is level with another's pin must turn before it (nearer F).
    const maxLane = innerLane ? (O - F) / unit : (O - F) / unit - 1;
    const lanes: [number, number][][] = [];
    const pending = new Set(laned);
    while (pending.size) {
      const ready = [...pending].find((k) => ![...pending].some((j) => j !== k && j.a0 === k.a1));
      if (!ready) return null;
      pending.delete(ready);
      const after = Math.max(0, ...laned.filter((j) => j.lane !== undefined && j.a0 === ready.a1).map((j) => j.lane!));
      const lo = Math.min(ready.a0, ready.a1);
      const hi = Math.max(ready.a0, ready.a1);
      let lane = after + 1;
      while (lane <= maxLane && (lanes[lane] ?? []).some(([l, h]) => !(hi < l || lo > h))) lane++;
      if (lane > maxLane) return null;
      ready.lane = lane;
      (lanes[lane] ??= []).push([lo, hi]);
      const d = F + lane * unit;
      const path: Pt[] = [ready.p.f, at(ready.a0, d), at(ready.a1, d)];
      if (d !== O) path.push(ready.p.o);
      wires.push(path);
    }
  }
  return wires;
}

/**
 * True when the wires join only where intended: no two segments overlap and no
 * end or corner lies inside another segment. `pins` are extra points (our
 * unwired pins) that must not touch any segment.
 */
export function wiresClean(wires: Pt[][], pins: Pt[] = [], distinct = true): boolean {
  const segs: [Pt, Pt][] = [];
  for (const w of wires) for (let k = 1; k < w.length; k++) if (!same(w[k - 1], w[k])) segs.push([w[k - 1], w[k]]);
  const inside = (p: Pt, [a, b]: [Pt, Pt]) => {
    if (a[0] === b[0]) return p[0] === a[0] && p[1] > Math.min(a[1], b[1]) && p[1] < Math.max(a[1], b[1]);
    if (a[1] === b[1]) return p[1] === a[1] && p[0] > Math.min(a[0], b[0]) && p[0] < Math.max(a[0], b[0]);
    return false;
  };
  const touches = (p: Pt, s: [Pt, Pt]) => inside(p, s) || same(p, s[0]) || same(p, s[1]);
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s[0][0] !== s[1][0] && s[0][1] !== s[1][1]) return false; // diagonal
    for (const p of pins) if (touches(p, s)) return false;
    for (let j = 0; j < segs.length; j++) {
      if (i === j) continue;
      const t = segs[j];
      if (inside(t[0], s) || inside(t[1], s)) return false;
      // Same-line overlap with equal end points (a doubled segment).
      if ((same(s[0], t[0]) && same(s[1], t[1])) || (same(s[0], t[1]) && same(s[1], t[0]))) return false;
    }
  }
  if (!distinct) return true;
  // Wires from different pins must not share a point.
  const ends = new Map<string, number>();
  wires.forEach((w, i) => {
    for (const p of w) {
      const key = p.join(",");
      if (ends.has(key) && ends.get(key) !== i) ends.set(key, -1);
      else if (!ends.has(key)) ends.set(key, i);
    }
  });
  return ![...ends.values()].includes(-1);
}

// ---------------------------------------------------------------- chips

const FLIP_X = 1 << 10;
const FLIP_Y = 1 << 11;
const FLIP_XY = 1 << 12;
export const CHIP_FLIPS = FLIP_X | FLIP_Y | FLIP_XY;

export interface ChipLayout {
  sizeX: number;
  sizeY: number;
  /** Falstad posts, unflipped, in pin spacings from (x1, y1): W pin k at (0, k), E at (sizeX+1, k), N at (k+1, -1), S at (k+1, sizeY). */
  pins: Pt[];
}

/** ChipElm's flips as a map of post positions (in pin spacings): FLAG_FLIP_XY first, then X and Y. */
function chipTransform(flags: number, sizeX: number, sizeY: number): (g: Pt) => Pt {
  return ([gx, gy]) => {
    let fx = sizeX;
    let fy = sizeY;
    if (flags & FLIP_XY) {
      [gx, gy] = [gy + 1, gx - 1];
      [fx, fy] = [sizeY, sizeX];
    }
    if (flags & FLIP_X) gx = fx + 1 - gx;
    if (flags & FLIP_Y) gy = fy - 1 - gy;
    return [gx, gy];
  };
}

function sideOut([gx, gy]: Pt, lay: ChipLayout): Pt {
  if (gx === 0) return [-1, 0];
  if (gx === lay.sizeX + 1) return [1, 0];
  return gy < 0 ? [0, -1] : [0, 1];
}

/**
 * Wrap a chip rule written for unflipped chips on a matching grid: flipped
 * chips are placed mirrored (our parts are scaled copies of Falstad's pin
 * layout), and big chips (32-pixel pins) in an 8-pixel circuit become
 * half-scale copies joined by a fan of wires.
 */
export function chipVariant(inner: Rule, layout: (el: FalstadElement) => ChipLayout | null): Rule {
  return (el, unit) => {
    const flips = el.flags & CHIP_FLIPS;
    const scaled = unit === 8 && !(el.flags & 1);
    if (!flips && !scaled) return inner(el, unit);
    const lay = layout(el);
    if (!lay) return null;
    const m = inner({ ...el, flags: (el.flags & ~CHIP_FLIPS) | (scaled ? 1 : 0) }, unit);
    if (!m?.place || m.place.flip) return null;
    const c = scaled ? 16 : 32 >> (el.flags & 1);
    const T = chipTransform(el.flags, lay.sizeX, lay.sizeY);
    const origin: Pt = [el.x1, el.y1];
    const P = (p: Pt, k = c): Pt => add(origin, T([(p[0] - el.x1) / c, (p[1] - el.y1) / c]), k);
    const t0 = T([0, 0]);
    const ex = add(T([1, 0]), t0, -1);
    const ey = add(T([0, 1]), t0, -1);
    const flip = !(ey[0] === -ex[1] && ey[1] === ex[0]);
    const place = { at: P(m.place.at), toward: P(m.place.toward), flip };
    const inWires = (m.wires ?? []).map((w) => w.map((p) => P(p)));
    if (!scaled) return { ...m, place, wires: inWires };
    const fan = lay.pins.map((g) => {
      const t = T(g);
      const o0 = add(T(add(g, sideOut(g, lay))), t, -1);
      return { f: add(origin, t, 32), o: add(origin, t, 16), out: o0 };
    });
    // Shift the half-scale copy inward until every side has room for its lanes.
    const steps = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8, -8].map((k) => k * unit);
    const shifts = steps.flatMap((sx) => steps.map((sy): Pt => [sx, sy])).sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) - Math.abs(b[0]) - Math.abs(b[1]));
    for (const s of shifts) {
      const pins = fan.map((p) => ({ ...p, o: add(p.o, s) }));
      const wires = fanWires(pins, unit);
      if (!wires) continue;
      const all = [...wires, ...inWires.map((w) => w.map((p) => add(p, s)))];
      if (!wiresClean(wires) || !wiresClean(all, [], false)) continue;
      return { ...m, place: { at: add(place.at, s), toward: add(place.toward, s), flip }, wires: all };
    }
    return null;
  };
}

/** Falstad posts of the chips we map, in ChipElm pin spacings. */
export const W = (k: number): Pt => [0, k];
export const E = (sizeX: number, k: number): Pt => [sizeX + 1, k];
export const N = (k: number): Pt => [k + 1, -1];
export const S = (sizeY: number, k: number): Pt => [k + 1, sizeY];

// ---------------------------------------------------------------- two-point parts

/** CircuitElm.interpPoint(point1, point2, f, g): `f` along the element, `g` across it. */
export function frame(el: FalstadElement) {
  const dx = el.x2 - el.x1;
  const dy = el.y2 - el.y1;
  const dn = Math.hypot(dx, dy) || 1;
  const u: Pt = [dx / dn, dy / dn];
  const n: Pt = [dy / dn, -dx / dn];
  const p = (along: number, across: number): Pt => [el.x1 + along * u[0] + across * n[0], el.y1 + along * u[1] + across * n[1]];
  return { dn, u, n, p };
}

const onGrid = (pts: Pt[], unit: number) => pts.every(([x, y]) => Number.isInteger(x / unit) && Number.isInteger(y / unit));

/**
 * Inputs at Falstad's 16-pixel spacing on an 8-pixel circuit (gates, op-amps):
 * our input column moves `x` pixels along the element, ours at half spacing.
 * `offsets` are the inputs' Falstad offsets across the element (16·i0).
 * Returns our first input's position, the length left for our part, and the wires.
 */
export function inputFan(el: FalstadElement, unit: number, offsets: number[], minLength: number) {
  const { dn, u, p } = frame(el);
  const back: Pt = [-u[0], -u[1]];
  for (let x = unit; dn - x >= minLength * unit; x += unit) {
    const pins = offsets.map((g) => ({ f: p(0, g), o: p(x, g / 2), out: back }));
    if (!onGrid(pins.flatMap((q) => [q.f, q.o]), unit)) return null;
    const wires = fanWires(pins, unit);
    if (wires && wiresClean(wires)) return { at: pins[0].o, length: dn - x, wires };
  }
  return null;
}

/**
 * Posts at the far end of the element, `16` pixels either side of point2
 * (transistors, MOSFETs, AnalogSwitch2Elm), on an 8-pixel circuit: our part is
 * `x` pixels shorter and its pins sit 8 pixels out. `mid` adds a control post
 * at the middle (`16` out on the given side; ours at our own middle, rounded
 * down to the grid like the part's midTerminals).
 */
export function farEndFan(el: FalstadElement, unit: number, minLength: number, mid?: number) {
  const { dn, u, n, p } = frame(el);
  for (let x = unit; dn - x >= minLength * unit; x += unit) {
    const pins: FanPin[] = [16, -16].map((g) => ({ f: p(dn, g), o: p(dn - x, g / 2), out: u }));
    if (mid !== undefined) {
      const ourMid = Math.floor((dn - x) / unit / 2) * unit;
      const out: Pt = mid > 0 ? n : [-n[0], -n[1]];
      pins.push({ f: p(dn / 2, mid), o: p(ourMid, mid / 2), out });
    }
    if (!onGrid(pins.flatMap((q) => [q.f, q.o]), unit)) return null;
    const wires = fanWires(pins, unit, true);
    if (wires && wiresClean(wires)) return { toward: p(dn - x, 0), wires };
  }
  return null;
}
