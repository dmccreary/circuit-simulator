import type { PropSpec } from "../api";
import { chipVariant, DIGITAL_CHIP_PROPS, type ChipVariant } from "../chip-kit/descriptor";
import type { ChipPin, ChipSpec } from "../chip-kit/layout";

/** Output counts offered (CircuitJS1 RingCounterElm defaults to 10, a 4017). */
export const RING_COUNTER_BITS = [4, 10] as const;

/**
 * CircuitJS1 RingCounterElm: clock on the left, outputs Q0.. along the top,
 * reset R at the bottom right and, with FLAG_CLOCK_INHIBIT, CE̅ at the bottom left.
 */
export function ringCounterSpec(bits: number, inhibit: boolean): ChipSpec {
  const sizeX = Math.max(2, bits);
  const pins: ChipPin[] = [
    { name: "", side: "W", pos: 1, dir: "in", clock: true },
    { name: "R", side: "S", pos: sizeX - 1, dir: "in" },
  ];
  for (let i = 0; i < bits; i++) pins.push({ name: `Q${i}`, side: "N", pos: i, dir: "out" });
  if (inhibit) pins.push({ name: "CE", side: "S", pos: 1, dir: "in", bar: true });
  return { title: "Ring Counter", sizeX, sizeY: 2, pins };
}

export const ringCounterType = (bits: number, inhibit: boolean) => `ring-counter-${bits}${inhibit ? "-ce" : ""}`;

const PROPS: PropSpec[] = [
  // Not FLAG_RESET_HIGH: R resets while low.
  { key: "invertReset", unit: "", kind: "boolean", default: true },
  ...DIGITAL_CHIP_PROPS,
];

export const RING_COUNTER_VARIANTS: ChipVariant[] = RING_COUNTER_BITS.flatMap((bits) =>
  [false, true].map((inhibit) =>
    chipVariant(ringCounterType(bits, inhibit), ringCounterSpec(bits, inhibit), {
      aliases: ["ring counter", "johnson counter", "decade counter", "4017", `${bits}-output ring counter`],
      props: PROPS,
    }),
  ),
);
