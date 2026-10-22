import type { CategoryId, ElementDescriptor, PropSpec, ReadoutSpec } from "../api";
import { LEVEL_PROPS, TIMING_PROPS } from "../logic/levels";
import { chipTerminals, type ChipSpec } from "./layout";

/** One size of a chip family: its own part type, since terminals are fixed per type. */
export interface ChipVariant {
  type: string;
  spec: ChipSpec;
  descriptor: ElementDescriptor;
}

/** Props of digital chips: timing, then the logic family levels. */
export const DIGITAL_CHIP_PROPS: PropSpec[] = [...TIMING_PROPS, ...LEVEL_PROPS];

export function chipVariant(
  type: string,
  spec: ChipSpec,
  o: { aliases: string[]; props: PropSpec[]; category?: CategoryId; labelPrefix?: string; readouts?: ReadoutSpec[] },
): ChipVariant {
  return {
    type,
    spec,
    descriptor: {
      type,
      category: o.category ?? "logic",
      aliases: o.aliases,
      labelPrefix: o.labelPrefix ?? "U",
      terminals: chipTerminals(spec),
      props: o.props,
      readouts: o.readouts ?? [],
    },
  };
}
