// Pin layout of rectangular chips, after CircuitJS1's ChipElm (setupPins,
// setPoints, makeBitPins): pins sit on the four sides of a sizeX × sizeY box,
// one Falstad spacing (two grid units) apart. Pure data: descriptors, views,
// the digital pin table and the Falstad importer all derive from a ChipSpec.

import type { Point } from "@cs/model";
import type { TerminalSpec } from "../api";

export type Side = "N" | "S" | "W" | "E";
/** "analog" pins are read or driven by the model's own stamps, not the digital kernel. */
export type PinDir = "in" | "out" | "analog";

export interface ChipPin {
  name: string;
  side: Side;
  /** Slot along the side: from the top (W, E) or from the left (N, S). */
  pos: number;
  dir: PinDir;
  clock?: boolean;
  bubble?: boolean;
  /** Active-low name, drawn with a bar over it. */
  bar?: boolean;
  /**
   * Bus pins (CircuitJS1 bitOrder "bus"): every bit of a bus shares one Falstad
   * post (side/pos, drawn as the lead). Ours get a terminal each at `at`, in
   * the chip frame inside the box, where no outside wire runs; the importer
   * joins each bit to its own net with a label there (formats bus.ts).
   */
  at?: Point;
}

export interface ChipSpec {
  title: string;
  sizeX: number;
  sizeY: number;
  /** In terminal order (CircuitJS1's pin index order). */
  pins: ChipPin[];
}

/** Grid units per Falstad pin spacing (cspc2). */
export const CHIP_PITCH = 2;

/** Position in the chip frame, where slot W0 is at (0, 0) and the box spans x 1..2·sizeX+1. */
export function chipFramePos(spec: ChipSpec, p: ChipPin): Point {
  if (p.at) return p.at;
  return chipPostPos(spec, p);
}

/** The Falstad post of a pin (a bus pin's shared post), in the chip frame. */
export function chipPostPos(spec: ChipSpec, p: ChipPin): Point {
  const k = CHIP_PITCH;
  switch (p.side) {
    case "W":
      return { x: 0, y: k * p.pos };
    case "E":
      return { x: k * (spec.sizeX + 1), y: k * p.pos };
    case "N":
      return { x: k * (1 + p.pos), y: -k };
    case "S":
      return { x: k * (1 + p.pos), y: k * spec.sizeY };
  }
}

/** Chip-frame position of terminal 0, the local origin of the part. */
export function chipOrigin(spec: ChipSpec): Point {
  return chipFramePos(spec, spec.pins[0]);
}

/** Terminal positions in the part's local frame (terminal 0 at the origin). */
export function chipTerminals(spec: ChipSpec): TerminalSpec[] {
  const o = chipOrigin(spec);
  return spec.pins.map((p) => {
    const q = chipFramePos(spec, p);
    return { name: p.name, at: { x: q.x - o.x + 0, y: q.y - o.y + 0 } };
  });
}

/**
 * ChipElm.makeBitPins in pin-index order, for the default most-significant-
 * bit-first order: bit i sits at slot pos + count-1-i. `reversed` puts the
 * most significant bit first in the index order too (CounterElm, ROMElm).
 */
export function bitPins(count: number, pos: number, side: Side, name: string, dir: PinDir, reversed = false): ChipPin[] {
  const out: ChipPin[] = [];
  for (let k = 0; k < count; k++) {
    const bit = reversed ? count - 1 - k : k;
    out.push({ name: `${name}${bit}`, side, pos: reversed ? pos + k : pos + count - 1 - k, dir });
  }
  return out;
}

/**
 * ChipElm.makeBitPins in bus order: all bits share the post at slot `pos`;
 * bit z's terminal is at(z). Index order as bitPins (MSB first when `reversed`).
 */
export function busPins(count: number, pos: number, side: Side, name: string, dir: PinDir, reversed: boolean, at: (z: number) => Point): ChipPin[] {
  const out: ChipPin[] = [];
  for (let k = 0; k < count; k++) {
    const bit = reversed ? count - 1 - k : k;
    out.push({ name: bit === 0 ? `${name}/${count}` : "", side, pos, dir, at: at(bit) });
  }
  return out;
}

/** Digital pin directions of a chip, for the logic pin table. */
export function chipDigitalPins(spec: ChipSpec): { pin: number; dir: "in" | "out" }[] {
  const out: { pin: number; dir: "in" | "out" }[] = [];
  spec.pins.forEach((p, pin) => {
    if (p.dir !== "analog") out.push({ pin, dir: p.dir });
  });
  return out;
}
