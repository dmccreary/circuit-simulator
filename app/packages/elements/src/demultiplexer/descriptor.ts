import type { PropSpec } from "../api";
import { chipVariant, DIGITAL_CHIP_PROPS, type ChipVariant } from "../chip-kit/descriptor";
import type { ChipPin, ChipSpec } from "../chip-kit/layout";

export const DEMUX_SELECT_BITS = [1, 2, 3] as const;

/**
 * CircuitJS1 DeMultiplexerElm, individual-output mode: outputs Q0.. down the
 * right, select bits S0.. along the bottom, the input on the left.
 */
export function demuxSpec(sel: number): ChipSpec {
  const n = 1 << sel;
  const pins: ChipPin[] = [];
  for (let i = 0; i < n; i++) pins.push({ name: `Q${i}`, side: "E", pos: i, dir: "out" });
  for (let i = 0; i < sel; i++) pins.push({ name: `S${i}`, side: "S", pos: i, dir: "in" });
  pins.push({ name: "Q", side: "W", pos: 0, dir: "in" });
  return { title: "Demux", sizeX: sel + 1, sizeY: n + 1, pins };
}

export const demuxType = (sel: number) => `demultiplexer-${sel}`;

/** FLAG_INVERT_OUTPUTS: unselected outputs idle high (74139). */
const PROPS: PropSpec[] = [{ key: "idleHigh", unit: "", kind: "boolean", default: false }, ...DIGITAL_CHIP_PROPS];

export const DEMUX_VARIANTS: ChipVariant[] = DEMUX_SELECT_BITS.map((sel) =>
  chipVariant(demuxType(sel), demuxSpec(sel), {
    aliases: ["demultiplexer", "demux", "decoder", `1-to-${1 << sel} demultiplexer`],
    props: PROPS,
  }),
);
