import type { PropSpec } from "../api";
import { chipVariant, DIGITAL_CHIP_PROPS, type ChipVariant } from "../chip-kit/descriptor";
import { bitPins, busPins, type ChipPin, type ChipSpec } from "../chip-kit/layout";

/** Bit counts offered for both counters. */
export const COUNTER_BITS = [3, 4, 8] as const;
export const SYNC_COUNTER_BITS = [4, 8] as const;

/**
 * CircuitJS1 CounterElm: clock at the top left, reset R at the bottom left,
 * outputs Q down the right with the most significant bit on top (and first).
 */
export function counterSpec(bits: number): ChipSpec {
  const pins: ChipPin[] = [
    { name: "", side: "W", pos: 0, dir: "in", clock: true },
    { name: "R", side: "W", pos: bits - 1, dir: "in" },
    ...bitPins(bits, 0, "E", "Q", "out", true),
  ];
  return { title: "Counter", sizeX: 2, sizeY: bits, pins };
}

/**
 * CircuitJS1 Counter2Elm (a 74163-style synchronous counter): outputs Q and
 * load inputs I, most significant bit on top, then CLK, CLR̄, EnP, RCO, LOAD̄, EnT.
 */
export function syncCounterSpec(bits: number, bus = false): ChipSpec {
  const rows = bus ? 1 : bits;
  // Bus form: bit z of Q in a column inside the right edge, of I inside the left edge.
  const pins: ChipPin[] = [
    ...(bus ? busPins(bits, 1, "E", "Q", "out", true, (z) => ({ x: 4, y: 1 + z })) : bitPins(bits, 1, "E", "Q", "out", true)),
    ...(bus ? busPins(bits, 1, "W", "I", "in", true, (z) => ({ x: 2, y: 1 + z })) : bitPins(bits, 1, "W", "I", "in", true)),
    { name: "", side: "W", pos: 0, dir: "in", clock: true },
    { name: "CLR", side: "W", pos: rows + 1, dir: "in", bubble: true },
    { name: "EnP", side: "W", pos: rows + 2, dir: "in" },
    { name: "RCO", side: "E", pos: 0, dir: "out" },
    { name: "LOAD", side: "E", pos: rows + 1, dir: "in", bubble: true },
    { name: "EnT", side: "E", pos: rows + 2, dir: "in" },
  ];
  return { title: "Counter", sizeX: 2, sizeY: rows + 3, pins };
}

export const counterType = (bits: number) => `counter-${bits}`;
export const syncCounterType = (bits: number, bus = false) => `sync-counter-${bits}${bus ? "-bus" : ""}`;
/** Bus-pin forms (CircuitJS1 bit order "bus"), as imported from XML files. */
export const SYNC_COUNTER_BUS_BITS = [4] as const;

const MODULUS: PropSpec = { key: "modulus", unit: "", range: [0, 1 << 16], default: 0 };

const COUNTER_PROPS: PropSpec[] = [
  MODULUS,
  // CounterElm's invertreset: R clears the count while low.
  { key: "invertReset", unit: "", kind: "boolean", default: false },
  { key: "negativeEdge", unit: "", kind: "boolean", default: false },
  ...DIGITAL_CHIP_PROPS,
];

export const COUNTER_VARIANTS: ChipVariant[] = [
  ...COUNTER_BITS.map((b) =>
    chipVariant(counterType(b), counterSpec(b), {
      aliases: ["counter", "binary counter", "ripple counter", `${b}-bit counter`],
      props: COUNTER_PROPS,
    }),
  ),
  ...SYNC_COUNTER_BITS.map((b) =>
    chipVariant(syncCounterType(b), syncCounterSpec(b), {
      aliases: ["synchronous counter", "74163", "loadable counter", `${b}-bit synchronous counter`],
      props: [MODULUS, ...DIGITAL_CHIP_PROPS],
    }),
  ),
  ...SYNC_COUNTER_BUS_BITS.map((b) =>
    chipVariant(syncCounterType(b, true), syncCounterSpec(b, true), {
      aliases: ["synchronous counter", "bus counter", `${b}-bit synchronous counter (bus)`],
      props: [MODULUS, ...DIGITAL_CHIP_PROPS],
    }),
  ),
];
