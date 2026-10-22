import type { PropSpec } from "../api";
import { chipVariant, DIGITAL_CHIP_PROPS, type ChipVariant } from "../chip-kit/descriptor";
import { bitPins, type ChipSpec } from "../chip-kit/layout";

export const LATCH_BITS = [4, 8] as const;

/** CircuitJS1 LatchElm without reset, set or enable pins: inputs I and outputs O, load below the inputs. */
export function latchSpec(bits: number): ChipSpec {
  return {
    title: "Latch",
    sizeX: 2,
    sizeY: bits + 1,
    pins: [
      ...bitPins(bits, 0, "W", "I", "in"),
      ...bitPins(bits, 0, "E", "O", "out"),
      { name: "Ld", side: "W", pos: bits, dir: "in" },
    ],
  };
}

export const latchType = (bits: number) => `latch-${bits}`;

/** Edge-triggered (a register, the CircuitJS1 default) or transparent while Ld is high (FLAG_NO_EDGE). */
const PROPS: PropSpec[] = [{ key: "edgeTriggered", unit: "", kind: "boolean", default: true }, ...DIGITAL_CHIP_PROPS];

export const LATCH_VARIANTS: ChipVariant[] = LATCH_BITS.map((b) =>
  chipVariant(latchType(b), latchSpec(b), {
    aliases: ["latch", "register", "data latch", `${b}-bit latch`],
    props: PROPS,
  }),
);
