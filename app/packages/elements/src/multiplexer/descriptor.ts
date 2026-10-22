import { chipVariant, DIGITAL_CHIP_PROPS, type ChipVariant } from "../chip-kit/descriptor";
import { busPins, type ChipPin, type ChipSpec } from "../chip-kit/layout";

/** Select-bit counts offered (CircuitJS1 MultiplexerElm allows 1..6; 2 is its default). */
export const MUX_SELECT_BITS = [1, 2, 3] as const;

/**
 * CircuitJS1 MultiplexerElm, individual-input mode: inputs I0.. down the
 * left, select bits S0.. along the bottom, output Q at the top right.
 */
export function muxSpec(sel: number): ChipSpec {
  const n = 1 << sel;
  const pins: ChipPin[] = [];
  for (let i = 0; i < n; i++) pins.push({ name: `I${i}`, side: "W", pos: i, dir: "in" });
  for (let i = 0; i < sel; i++) pins.push({ name: `S${i}`, side: "S", pos: i + 1, dir: "in" });
  pins.push({ name: "Q", side: "E", pos: 0, dir: "out" });
  return { title: "Mux", sizeX: sel + 1, sizeY: n + 1, pins };
}

export const muxType = (sel: number) => `multiplexer-${sel}`;

/** Bus input / bus output mode (inputMode 2): [select bits, data width]. */
export const MUX_BUS_SIZES: readonly [number, number][] = [[2, 4]];

/** MultiplexerElm in bus/bus mode: input buses I0.. down the left, select bits below, output bus Q at the top right. */
export function muxBusSpec(sel: number, width: number): ChipSpec {
  const n = 1 << sel;
  const pins: ChipPin[] = [];
  // Bit z of each bus in a 2 × 2 block (width 4) inside the box next to its post.
  const block = (x: number, y: number) => (z: number) => ({ x: x + (z % 2), y: y + Math.floor(z / 2) });
  for (let g = 0; g < n; g++) pins.push(...busPins(width, g, "W", `I${g}`, "in", false, block(2, 2 * g)));
  for (let i = 0; i < sel; i++) pins.push({ name: `S${i}`, side: "S", pos: i + 1, dir: "in" });
  pins.push(...busPins(width, 0, "E", "Q", "out", false, block(2 * sel + 1, 0)));
  return { title: "Mux", sizeX: sel + 1, sizeY: n + 1, pins };
}

export const muxBusType = (sel: number, width: number) => `multiplexer-${sel}-bus${width}`;

export const MUX_VARIANTS: ChipVariant[] = MUX_SELECT_BITS.map((sel) =>
  chipVariant(muxType(sel), muxSpec(sel), {
    aliases: ["multiplexer", "mux", "data selector", `${1 << sel}-to-1 multiplexer`],
    props: DIGITAL_CHIP_PROPS,
  }),
).concat(
  MUX_BUS_SIZES.map(([sel, w]) =>
    chipVariant(muxBusType(sel, w), muxBusSpec(sel, w), {
      aliases: ["multiplexer", "mux", "bus multiplexer", `${1 << sel}-to-1 ${w}-bit multiplexer`],
      props: DIGITAL_CHIP_PROPS,
    }),
  ),
);
