import type { PropSpec } from "../api";
import { chipVariant, DIGITAL_CHIP_PROPS, type ChipVariant } from "../chip-kit/descriptor";
import { bitPins, busPins, type ChipSpec } from "../chip-kit/layout";

/** [address bits, data bits] offered (CircuitJS1 ROMElm defaults to 4 × 4). */
export const ROM_SIZES: readonly [number, number][] = [
  [4, 4],
  [4, 8],
  [8, 4],
  [8, 8],
];

/**
 * CircuitJS1 ROMElm: OE̅ at the top left, address A below it and data D on the
 * right, most significant bit on top (and first).
 */
export function romSpec(ab: number, db: number, bus = false): ChipSpec {
  const sizeY = bus ? 2 : Math.max(ab, db) + 1;
  return {
    title: "ROM",
    sizeX: 2,
    sizeY,
    pins: [
      { name: "OE", side: "W", pos: 0, dir: "in", bar: true },
      // Bus form: A in a column inside the left edge, D in two columns inside the right edge.
      ...(bus ? busPins(ab, 1, "W", "A", "in", true, (z) => ({ x: 2, y: z })) : bitPins(ab, sizeY - ab, "W", "A", "in", true)),
      ...(bus
        ? busPins(db, 1, "E", "D", "out", true, (z) => ({ x: z < 4 ? 4 : 3, y: z % 4 }))
        : bitPins(db, sizeY - db, "E", "D", "out", true)),
    ],
  };
}

export const romType = (ab: number, db: number, bus = false) => `rom-${ab}x${db}${bus ? "-bus" : ""}`;
export const ROM_BUS_SIZES: readonly [number, number][] = [[4, 8]];

/** Contents as CircuitJS1's editor writes them: lines "address: value value ...", 0x/0b prefixes allowed. */
const PROPS: PropSpec[] = [
  { key: "contents", unit: "", kind: "text", default: "" },
  // FLAG_HEX_DISPLAY: numbers without a prefix are hexadecimal.
  { key: "hex", unit: "", kind: "boolean", default: false },
  ...DIGITAL_CHIP_PROPS,
];

export const ROM_VARIANTS: ChipVariant[] = ROM_SIZES.map(([ab, db]) =>
  chipVariant(romType(ab, db), romSpec(ab, db), {
    aliases: ["rom", "read-only memory", "memory", "lookup table", `${1 << ab} × ${db} rom`],
    props: PROPS,
  }),
).concat(
  ROM_BUS_SIZES.map(([ab, db]) =>
    chipVariant(romType(ab, db, true), romSpec(ab, db, true), {
      aliases: ["rom", "read-only memory", `${1 << ab} × ${db} rom (bus)`],
      props: PROPS,
    }),
  ),
);

/** Parse ROM contents (SRAMElm.parseContentsString); unreadable lines are skipped. */
export function parseRomContents(text: string, hex = false): Map<number, number> {
  const map = new Map<number, number>();
  const parse = (s: string): number => {
    if (s.startsWith("0x")) return parseInt(s.slice(2), 16);
    if (hex) return parseInt(s, 16);
    if (s.startsWith("0b")) return parseInt(s.slice(2), 2);
    return Number(s);
  };
  for (const line of text.split("\n")) {
    const m = /^\s*([^:\s]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    let addr = parse(m[1]);
    if (!Number.isInteger(addr)) continue;
    for (const tok of m[2].trim().split(/\s+/)) {
      if (!tok) continue;
      const v = parse(tok);
      if (!Number.isInteger(v)) break;
      map.set(addr++, v);
    }
  }
  return map;
}
